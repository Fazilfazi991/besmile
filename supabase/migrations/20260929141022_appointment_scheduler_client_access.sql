-- Appointment scheduling is an identity-only workflow. Authorized schedulers
-- may book any active client without receiving access to clinical workspace data.

create or replace function public.appointment_patient_access(action text, target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.appointment_has_permission(action)
    and case
      when action = 'create' then exists(
        select 1
        from public.patients p
        where p.id = target_patient
          and p.deleted_at is null
          and p.archived_at is null
      )
      when action = 'view' then public.patient_care_access(target_patient)
      else public.patient_care_access(target_patient)
        and exists(
          select 1
          from public.patients p
          where p.id = target_patient
            and p.deleted_at is null
            and p.archived_at is null
        )
    end
$$;

revoke all on function public.appointment_patient_access(text, uuid) from public, anon;
grant execute on function public.appointment_patient_access(text, uuid) to authenticated;

create or replace function public.appointment_patient_options(
  search_text text default null,
  page_offset integer default 0,
  page_size integer default 40,
  selected_patient uuid default null
)
returns table(id uuid, full_name text, patient_number text, phone text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.patient_number, p.phone, p.slug
  from public.patients p
  where auth.uid() is not null
    and public.appointment_has_permission('create')
    and p.deleted_at is null
    and p.archived_at is null
    and (
      p.id = selected_patient
      or nullif(btrim(search_text), '') is null
      or p.full_name ilike '%' || btrim(search_text) || '%'
      or p.patient_number ilike '%' || btrim(search_text) || '%'
      or p.phone ilike '%' || btrim(search_text) || '%'
    )
  order by (p.id = selected_patient) desc, lower(p.full_name), p.id
  offset greatest(page_offset, 0)
  limit least(greatest(page_size, 1), 100)
$$;

revoke all on function public.appointment_patient_options(text, integer, integer, uuid) from public, anon;
grant execute on function public.appointment_patient_options(text, integer, integer, uuid) to authenticated;
