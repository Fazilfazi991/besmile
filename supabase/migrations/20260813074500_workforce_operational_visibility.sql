-- Keep authenticated QA, legacy duplicate, and vendor accounts available for
-- audit/history without exposing them in day-to-day workforce selectors.
alter table public.profiles
  add column if not exists workforce_visible boolean not null default true;

comment on column public.profiles.workforce_visible is
  'Controls inclusion in operational workforce counts and assignee/recipient selectors. Hidden profiles retain auth and historical relations.';

update public.profiles
set workforce_visible = false
where lower(coalesce(email, '')) like '%@qa.bsmile.local'
   or lower(coalesce(email, '')) like '%@bsmile.test'
   or lower(coalesce(full_name, '')) like 'qa %'
   or lower(coalesce(email, '')) in (
     'aiswarya.p@bsmile.local',
     'diya.anthikat@bsmile.local',
     'fusionventureworks@gmail.com'
   );

create index if not exists profiles_operational_workforce_idx
  on public.profiles(status, full_name)
  where is_employee and workforce_visible;

-- Correction uploads replace the request metadata first, then remove the
-- superseded object. Owners need a narrow delete policy for their own folder.
drop policy if exists "document object owners delete" on storage.objects;
create policy "document object owners delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "document submissions owner correction" on public.document_submissions;
create policy "document submissions owner correction"
on public.document_submissions for update to authenticated
using (
  submitted_by = (select auth.uid())
  and exists (
    select 1 from public.document_requests request
    where request.id = document_submissions.request_id
      and request.profile_id = (select auth.uid())
      and request.status = 'submitted'
  )
)
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1 from public.document_requests request
    where request.id = document_submissions.request_id
      and request.profile_id = (select auth.uid())
      and request.status = 'submitted'
  )
);

-- Payroll creation is server-side and must apply the same operational
-- workforce boundary as UI selectors. Existing runs/history are untouched.
create or replace function public.create_payroll_run_atomic(target_period_start date, target_period_end date)
returns public.payroll_runs
language plpgsql
security definer
set search_path = ''
as $$
declare created_run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if target_period_start is null or target_period_end is null or target_period_end < target_period_start then
    raise exception 'Invalid payroll period.';
  end if;
  insert into public.payroll_runs(period_start, period_end, status, created_by)
  values(target_period_start, target_period_end, 'draft', (select auth.uid()))
  returning * into created_run;
  insert into public.payroll_entries(payroll_run_id, profile_id, basic_salary, allowances, deductions, payment_status)
  select created_run.id, settings.profile_id, settings.basic_salary, settings.default_allowances, settings.default_deductions, 'draft'
  from public.employee_salary_settings settings
  join public.profiles profile on profile.id = settings.profile_id
  where settings.is_active
    and profile.is_employee
    and profile.workforce_visible
    and profile.status = 'active';
  if not found then raise exception 'No active employee salary settings are available.'; end if;
  return created_run;
end
$$;

revoke all on function public.create_payroll_run_atomic(date,date) from public, anon;
grant execute on function public.create_payroll_run_atomic(date,date) to authenticated, service_role;

notify pgrst, 'reload schema';
