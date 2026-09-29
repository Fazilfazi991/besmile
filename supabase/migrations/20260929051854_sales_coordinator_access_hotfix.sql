-- Restore the already-approved Sales Coordinator access bundle for the
-- Marketing department. The existing Operations bundle remains unchanged.
--
-- Manual rollback (only if the business rule is withdrawn): delete the rows
-- in designation_permission_bundle_permissions for the Marketing / Sales
-- Coordinator bundle, then delete that bundle. No profile data is changed.

do $$
declare
  expected_permissions constant text[] := array[
    'attendance.self',
    'crm.import',
    'crm.view_assigned',
    'dashboard.view',
    'leads.create',
    'leads.edit',
    'leads.view_all',
    'leave.self',
    'patients.view_identity',
    'tasks.view_self'
  ];
  operations_permissions text[];
begin
  select array_agg(permission.code order by permission.code)
  into operations_permissions
  from public.designation_permission_bundles bundle
  join public.designation_permission_bundle_permissions bundle_permission
    on bundle_permission.bundle_id = bundle.id
  join public.permissions permission
    on permission.id = bundle_permission.permission_id
  where bundle.department_name = 'Operations'
    and bundle.designation = 'Sales Coordinator'
    and bundle.is_active;

  if operations_permissions is distinct from expected_permissions then
    raise exception
      'Operations / Sales Coordinator permission baseline changed; refusing Marketing hotfix. Expected %, found %',
      expected_permissions,
      operations_permissions;
  end if;
end
$$;

insert into public.designation_permission_bundles(
  name,
  department_name,
  designation,
  is_active
)
values (
  'Marketing Sales Coordinator',
  'Marketing',
  'Sales Coordinator',
  true
)
on conflict(department_name, designation) do update
set is_active = true,
    updated_at = now();

insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, permission.id
from public.designation_permission_bundles bundle
cross join public.permissions permission
where bundle.department_name = 'Marketing'
  and bundle.designation = 'Sales Coordinator'
  and bundle.is_active
  and permission.code = any(array[
    'attendance.self',
    'crm.import',
    'crm.view_assigned',
    'dashboard.view',
    'leads.create',
    'leads.edit',
    'leads.view_all',
    'leave.self',
    'patients.view_identity',
    'tasks.view_self'
  ])
on conflict do nothing;

do $$
declare
  granted_count integer;
begin
  select count(*)
  into granted_count
  from public.designation_permission_bundles bundle
  join public.designation_permission_bundle_permissions bundle_permission
    on bundle_permission.bundle_id = bundle.id
  join public.permissions permission
    on permission.id = bundle_permission.permission_id
  where bundle.department_name = 'Marketing'
    and bundle.designation = 'Sales Coordinator'
    and bundle.is_active
    and permission.code = any(array[
      'attendance.self',
      'crm.import',
      'crm.view_assigned',
      'dashboard.view',
      'leads.create',
      'leads.edit',
      'leads.view_all',
      'leave.self',
      'patients.view_identity',
      'tasks.view_self'
    ]);

  if granted_count <> 10 then
    raise exception
      'Marketing / Sales Coordinator hotfix expected 10 permission rows, found %',
      granted_count;
  end if;
end
$$;
