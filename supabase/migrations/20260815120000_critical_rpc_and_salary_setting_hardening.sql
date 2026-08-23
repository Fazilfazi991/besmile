-- Production remediation: these helper functions are implementation details for
-- trusted database workflows, not PostgREST APIs for browser clients.
revoke all on function public.finance_account_balance(uuid) from public, anon, authenticated;
revoke all on function public.finance_invoice_total(uuid) from public, anon, authenticated;
revoke all on function public.finance_invoice_paid(uuid) from public, anon, authenticated;

-- notify_user has legacy overloads.  Revoke every overload so an authenticated
-- browser session cannot manufacture notifications for arbitrary employees.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_user'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end
$$;

-- This is the only browser-initiated notification path retained in this batch.
-- It derives actor, content and recipient eligibility from the persisted comment;
-- callers cannot supply a sender, title, body, link, or arbitrary entity.
create or replace function public.notify_idea_mention(target_profile uuid, target_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_row public.idea_comments%rowtype;
  recipient public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into comment_row from public.idea_comments where id = target_comment;
  if comment_row.id is null or comment_row.author_employee_id is distinct from auth.uid() then
    raise exception 'You may only notify mentions from your own comment.' using errcode = '42501';
  end if;

  select * into recipient from public.profiles
  where id = target_profile and is_employee and workforce_visible and status = 'active';
  if recipient.id is null or recipient.id = auth.uid() then
    raise exception 'Choose a valid mentioned employee.' using errcode = '22023';
  end if;

  if position(lower('@' || recipient.full_name) in lower(coalesce(comment_row.content, ''))) = 0 then
    raise exception 'The selected employee is not mentioned in this comment.' using errcode = '22023';
  end if;

  perform public.notify_user(
    recipient.id,
    'You were mentioned in Innovation Hub',
    'A colleague mentioned you in an Innovation Hub comment.',
    'idea_mention',
    comment_row.idea_id,
    '/employee/ideas/' || comment_row.idea_id::text,
    auth.uid(),
    'ideas',
    'normal',
    'none',
    false,
    jsonb_build_object('comment_id', comment_row.id)
  );
end
$$;

revoke all on function public.notify_idea_mention(uuid, uuid) from public, anon;
grant execute on function public.notify_idea_mention(uuid, uuid) to authenticated, service_role;

-- Keep salary-setting safety independent of the client form and ensure the
-- audit attribution cannot be forged by a browser payload.
create or replace function public.validate_employee_salary_setting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_permission('payroll.manage') then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;

  if new.profile_id is null or not exists (
    select 1 from public.profiles profile
    where profile.id = new.profile_id
      and profile.is_employee
      and profile.status = 'active'
      and profile.workforce_visible
  ) then
    raise exception 'Select an active employee.' using errcode = '22023';
  end if;

  if new.effective_date is null then
    raise exception 'Select an effective date.' using errcode = '22023';
  end if;

  if new.basic_salary is null or new.basic_salary <= 0 then
    raise exception 'Basic salary must be greater than zero.' using errcode = '22023';
  end if;

  if new.default_allowances is null or new.default_allowances < 0
    or new.default_deductions is null or new.default_deductions < 0 then
    raise exception 'Allowances and deductions cannot be negative.' using errcode = '22023';
  end if;

  new.updated_by := auth.uid();
  return new;
end
$$;

revoke all on function public.validate_employee_salary_setting() from public, anon, authenticated;
drop trigger if exists employee_salary_settings_validate_before_write on public.employee_salary_settings;
create trigger employee_salary_settings_validate_before_write
before insert or update of profile_id, effective_date, basic_salary, default_allowances, default_deductions, is_active, updated_by
on public.employee_salary_settings
for each row execute function public.validate_employee_salary_setting();

-- Date validation must also apply to direct Data API writes; the UI is only a
-- convenience layer and must never be able to send blank values to PostgreSQL.
create or replace function public.validate_leave_request_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.starts_on is null then
    raise exception 'Select a start date.' using errcode = '22023';
  end if;
  if new.ends_on is null then
    raise exception 'Select an end date.' using errcode = '22023';
  end if;
  if new.ends_on < new.starts_on then
    raise exception 'End date cannot be before the start date.' using errcode = '22023';
  end if;
  return new;
end
$$;

revoke all on function public.validate_leave_request_dates() from public, anon, authenticated;
drop trigger if exists leave_requests_validate_dates_before_write on public.leave_requests;
create trigger leave_requests_validate_dates_before_write
before insert or update of starts_on, ends_on on public.leave_requests
for each row execute function public.validate_leave_request_dates();

-- The approved Intern CRM workflow is explicitly self-scoped.  The trigger
-- owns creator metadata and prevents a client payload from assigning a lead to
-- another employee unless it has the existing assignment capability.
create or replace function public.enforce_crm_lead_insert_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_permission('leads.create') then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.assigned_to := coalesce(new.assigned_to, auth.uid());
  if new.assigned_to is distinct from auth.uid()
    and not public.has_permission('leads.assign')
    and not public.has_permission('crm.manage_all') then
    raise exception 'Permission denied for lead assignment.' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_crm_lead_insert_identity() from public, anon, authenticated;
drop trigger if exists crm_leads_enforce_insert_identity on public.crm_leads;
create trigger crm_leads_enforce_insert_identity
before insert on public.crm_leads
for each row execute function public.enforce_crm_lead_insert_identity();

notify pgrst, 'reload schema';
