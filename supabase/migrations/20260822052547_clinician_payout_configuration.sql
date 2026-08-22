-- Payout configuration is operational clinician data, not Finance or Payroll access.
-- Rates are snapshotted onto new appointments by the existing appointment RPC; this
-- migration deliberately never reconciles historical appointments or payables.

insert into public.permissions(code, description) values
  ('psychologist_payout_settings.manage', 'View and manage outsourced clinician session payout settings')
on conflict (code) do update set description = excluded.description;

-- Keep top-management access compatible with either supported RBAC schema. Aiswarya
-- receives a direct, active-profile grant below so no psychologist/Finance role is broadened.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select management_role.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as management_role(role_name)
    join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
    where role.code in ('chairman', 'director', 'general_manager')
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema for psychologist payout setting permissions';
  end if;
end $$;

insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Approved outsourced clinician payout-rate management'
from public.profiles profile
join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
where profile.id = '4096a95f-970b-4542-8f18-cf5dd6a66150'::uuid
  and profile.status = 'active'
  and not exists (
    select 1
    from public.user_permission_grants grant_row
    where grant_row.profile_id = profile.id
      and grant_row.permission_id = permission.id
      and grant_row.revoked_at is null
  );

drop policy if exists "psychologist payout settings finance access" on public.psychologist_payout_settings;
drop policy if exists "psychologist payout settings management access" on public.psychologist_payout_settings;
create policy "psychologist payout settings management access"
  on public.psychologist_payout_settings for all to authenticated
  using (public.has_permission('psychologist_payout_settings.manage'))
  with check (public.has_permission('psychologist_payout_settings.manage'));

create or replace function public.managed_psychologist_payout_settings()
returns table(
  doctor_id uuid,
  default_session_payout numeric,
  currency text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_permission('psychologist_payout_settings.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
  select setting.doctor_id, setting.default_session_payout, 'INR'::text,
         setting.is_active, setting.updated_at
  from public.psychologist_payout_settings setting
  join public.outsourced_doctors clinician on clinician.id = setting.doctor_id
  where clinician.archived_at is null
  order by clinician.doctor_name;
end;
$$;
revoke all on function public.managed_psychologist_payout_settings() from public, anon;
grant execute on function public.managed_psychologist_payout_settings() to authenticated;

create or replace function public.set_psychologist_payout_setting(
  target_doctor uuid,
  target_payout numeric
)
returns public.psychologist_payout_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician public.outsourced_doctors%rowtype;
  previous_setting public.psychologist_payout_settings%rowtype;
  saved_setting public.psychologist_payout_settings%rowtype;
  previous_data jsonb;
begin
  if (select auth.uid()) is null
     or not public.has_permission('psychologist_payout_settings.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_payout is null or target_payout <= 0 then
    raise exception 'Psychologist session payout must be greater than zero.';
  end if;

  select * into clinician
  from public.outsourced_doctors
  where id = target_doctor and archived_at is null
  for update;
  if clinician.id is null or clinician.clinician_type <> 'outsourced' or clinician.status <> 'active' then
    raise exception 'Only active outsourced clinicians can have a psychologist payout setting.';
  end if;

  select * into previous_setting
  from public.psychologist_payout_settings
  where doctor_id = clinician.id
  for update;
  previous_data := case when previous_setting.id is null then null else to_jsonb(previous_setting) end;

  insert into public.psychologist_payout_settings(
    doctor_id, default_session_payout, is_active, updated_by
  ) values (
    clinician.id, target_payout, true, (select auth.uid())
  )
  on conflict (doctor_id) do update
    set default_session_payout = excluded.default_session_payout,
        is_active = true,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into saved_setting;

  if previous_data is distinct from to_jsonb(saved_setting) then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      (select auth.uid()),
      'psychologist_payout_setting_updated',
      'psychologist_payout_settings',
      saved_setting.id,
      previous_data,
      jsonb_build_object(
        'doctor_id', clinician.id,
        'previous_session_payout', previous_setting.default_session_payout,
        'new_session_payout', saved_setting.default_session_payout,
        'currency', 'INR'
      )
    );
  end if;
  return saved_setting;
end;
$$;
revoke all on function public.set_psychologist_payout_setting(uuid, numeric) from public, anon;
grant execute on function public.set_psychologist_payout_setting(uuid, numeric) to authenticated;

-- New eligible outsourced clinicians receive an initial INR 800 setting exactly once.
-- It never overwrites an active administrator-configured rate.
create or replace function public.initialize_outsourced_psychologist_payout_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare saved_setting public.psychologist_payout_settings%rowtype;
begin
  if new.clinician_type = 'outsourced'
     and new.status = 'active'
     and new.archived_at is null
     and (
       tg_op = 'INSERT'
       or old.clinician_type is distinct from 'outsourced'
       or old.status is distinct from 'active'
       or old.archived_at is not null
     ) then
    insert into public.psychologist_payout_settings(
      doctor_id, default_session_payout, is_active, updated_by
    ) values (new.id, 800, true, new.updated_by)
    on conflict (doctor_id) do update
      set is_active = true,
          updated_by = excluded.updated_by,
          updated_at = now()
      where public.psychologist_payout_settings.is_active = false
    returning * into saved_setting;

    if saved_setting.id is not null then
      insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
      values (
        new.updated_by,
        'psychologist_payout_setting_initialized',
        'psychologist_payout_settings',
        saved_setting.id,
        jsonb_build_object('doctor_id', new.id, 'new_session_payout', saved_setting.default_session_payout, 'currency', 'INR')
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.initialize_outsourced_psychologist_payout_setting() from public, anon, authenticated;
drop trigger if exists outsourced_psychologist_payout_setting_initialize on public.outsourced_doctors;
create trigger outsourced_psychologist_payout_setting_initialize
after insert or update of clinician_type, status, archived_at on public.outsourced_doctors
for each row execute function public.initialize_outsourced_psychologist_payout_setting();

-- Production-approved initial configuration: only active, non-archived outsourced clinicians.
-- No appointment, payable, or finance table is read or changed in this loop.
do $$
declare
  clinician record;
  previous_data jsonb;
  saved_setting public.psychologist_payout_settings%rowtype;
begin
  for clinician in
    select doctor.id
    from public.outsourced_doctors doctor
    where doctor.clinician_type = 'outsourced'
      and doctor.status = 'active'
      and doctor.archived_at is null
    for update
  loop
    select to_jsonb(setting) into previous_data
    from public.psychologist_payout_settings setting
    where setting.doctor_id = clinician.id
    for update;

    insert into public.psychologist_payout_settings(
      doctor_id, default_session_payout, is_active, updated_by
    ) values (clinician.id, 800, true, null)
    on conflict (doctor_id) do update
      set default_session_payout = excluded.default_session_payout,
          is_active = true,
          updated_by = null,
          updated_at = now()
    returning * into saved_setting;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      null,
      'psychologist_payout_setting_configured',
      'psychologist_payout_settings',
      saved_setting.id,
      previous_data,
      jsonb_build_object('doctor_id', clinician.id, 'previous_session_payout', coalesce(previous_data ->> 'default_session_payout', null), 'new_session_payout', saved_setting.default_session_payout, 'currency', 'INR', 'source', 'approved_active_outsourced_configuration')
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
