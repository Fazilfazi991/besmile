-- Resolve legacy Psychology account metadata and make the existing Psychology Intern
-- designation an explicit alias of the Intern Psychologist scheduling bundle.

do $$
declare
  care_team_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status'
  ];
  scheduling_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.manage_doctors','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status','appointments.delete'
  ];
  psychology_department_id uuid;
begin
  select id into psychology_department_id
  from public.departments
  where lower(name) = 'psychology'
  order by created_at
  limit 1;

  if psychology_department_id is null then
    raise exception 'Psychology department is required before mapping Psychology staff.';
  end if;

  -- The legacy login is a distinct, active account. Keep its identity and all related
  -- records intact while correcting only the organizational fields that resolve bundles.
  update public.profiles profile
  set role = 'psychologist'::public.app_role,
      department_id = psychology_department_id,
      designation = 'Psychologist',
      updated_at = now()
  where lower(profile.email) = 'aiswarya.p@bsmile.local';

  insert into public.designation_permission_bundles(name, department_name, designation, is_active)
  values
    ('Psychology Psychologist', 'Psychology', 'Psychologist', true),
    ('Psychology Intern Psychologist', 'Psychology', 'Intern Psychologist', true),
    ('Psychology Psychology Intern', 'Psychology', 'Psychology Intern', true)
  on conflict(name) do update
  set department_name = excluded.department_name,
      designation = excluded.designation,
      is_active = true,
      updated_at = now();

  insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
  select bundle.id, permission.id
  from public.designation_permission_bundles bundle
  join public.permissions permission on permission.code = any(care_team_permissions)
  where bundle.is_active
    and lower(bundle.department_name) = 'psychology'
    and lower(bundle.designation) in ('psychologist', 'intern psychologist', 'psychology intern')
  on conflict do nothing;

  -- Keep the generic Intern role and generic Intern designation outside this module.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    delete from public.role_permissions role_permission
    using public.roles role, public.permissions permission
    where role_permission.role_id = role.id
      and role_permission.permission_id = permission.id
      and role.code = 'intern'
      and permission.code = any(scheduling_permissions);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    delete from public.role_permissions role_permission
    using public.permissions permission
    where role_permission.permission_id = permission.id
      and role_permission.role::text = 'Intern'
      and permission.code = any(scheduling_permissions);
  end if;

  delete from public.designation_permission_bundle_permissions bundle_permission
  using public.designation_permission_bundles bundle, public.permissions permission
  where bundle_permission.bundle_id = bundle.id
    and bundle_permission.permission_id = permission.id
    and lower(bundle.designation) = 'intern'
    and permission.code = any(scheduling_permissions);
end $$;

notify pgrst, 'reload schema';
