-- Make Doctor Scheduling access reusable, role-scoped, and explicit for Psychology interns.
-- Existing users receive the changed access through public.has_permission on their next refresh.

insert into public.permissions(code, description) values
  ('doctor_scheduling.view', 'View Doctor Scheduling'),
  ('doctor_scheduling.manage_doctors', 'Manage outsourced doctor profiles and availability'),
  ('doctor_scheduling.create_appointments', 'Create doctor appointments'),
  ('doctor_scheduling.update_appointments', 'Update and reschedule doctor appointments'),
  ('doctor_scheduling.cancel_appointments', 'Cancel doctor appointments'),
  ('appointments.view', 'View doctor appointments from patient profiles'),
  ('appointments.create', 'Create doctor appointments from patient profiles'),
  ('appointments.update', 'Edit doctor appointments from patient profiles'),
  ('appointments.reschedule', 'Reschedule doctor appointments from patient profiles'),
  ('appointments.cancel', 'Cancel doctor appointments from patient profiles'),
  ('appointments.update_status', 'Update doctor appointment status from patient profiles'),
  ('appointments.delete', 'Soft delete doctor appointments from patient profiles')
on conflict(code) do update set description = excluded.description;

do $$
declare
  management_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.manage_doctors','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status','appointments.delete'
  ];
  care_team_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status'
  ];
  scheduling_permissions text[] := management_permissions;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on (
      (role.code in ('chairman','director','general_manager') and permission.code = any(management_permissions))
      or (role.code = 'psychologist' and permission.code = any(care_team_permissions))
    )
    on conflict do nothing;

    -- Earlier scheduling setup made all Interns eligible. Keep only explicit grants.
    delete from public.role_permissions role_permission
    using public.roles role, public.permissions permission
    where role_permission.role_id = role.id
      and role_permission.permission_id = permission.id
      and role.code = 'intern'
      and permission.code = any(scheduling_permissions);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select seed.role_name::public.employee_role, permission.id
    from (
      values
        ('Chairman', management_permissions),
        ('Director', management_permissions),
        ('General Manager', management_permissions),
        ('Psychologist', care_team_permissions)
    ) as seed(role_name, codes)
    join public.permissions permission on permission.code = any(seed.codes)
    on conflict do nothing;

    delete from public.role_permissions role_permission
    using public.permissions permission
    where role_permission.permission_id = permission.id
      and role_permission.role::text = 'Intern'
      and permission.code = any(scheduling_permissions);
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'designation_permission_bundles') then
    insert into public.designation_permission_bundles(name, department_name, designation, is_active)
    values
      ('Psychology Psychologist', 'Psychology', 'Psychologist', true),
      ('Psychology Intern Psychologist', 'Psychology', 'Intern Psychologist', true)
    on conflict(name) do update
    set department_name = excluded.department_name,
        designation = excluded.designation,
        is_active = true,
        updated_at = now();

    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission on (
      (lower(bundle.designation) = 'psychologist' and permission.code = any(care_team_permissions))
      or (lower(bundle.designation) = 'intern psychologist' and permission.code = any(care_team_permissions))
    )
    where bundle.is_active
    on conflict do nothing;

    -- A generic Intern bundle must not acquire Doctor Scheduling automatically.
    delete from public.designation_permission_bundle_permissions bundle_permission
    using public.designation_permission_bundles bundle, public.permissions permission
    where bundle_permission.bundle_id = bundle.id
      and bundle_permission.permission_id = permission.id
      and lower(bundle.designation) = 'intern'
      and permission.code = any(scheduling_permissions);
  end if;
end $$;

notify pgrst, 'reload schema';
