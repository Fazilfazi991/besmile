-- Close only the two QA-qualified operational gaps. These permissions already
-- exist and retain the canonical assigned/self CRM RLS boundaries.
with requested_permissions(department_name, designation, permission_code) as (
  values
    ('Psychology', 'Psychologist', 'crm.view_assigned'),
    ('Operations', 'Sales Coordinator', 'crm.view_assigned'),
    ('Operations', 'Sales Coordinator', 'leads.edit')
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, permission.id
from requested_permissions requested
join public.designation_permission_bundles bundle
  on bundle.department_name = requested.department_name
 and bundle.designation = requested.designation
 and bundle.is_active
join public.permissions permission
  on permission.code = requested.permission_code
on conflict do nothing;

-- Psychologist is also a dedicated canonical role. Mirror only the assigned
-- CRM read permission so fixtures and accounts without a department relation
-- resolve the same narrow lead scope. Sales Coordinator remains designation-
-- scoped because its underlying role is shared with unrelated staff.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'Psychologist'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = 'crm.view_assigned'
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    cross join public.permissions permission
    where role.code = 'psychologist'
      and permission.code = 'crm.view_assigned'
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema for QA qualification alignment';
  end if;
end $$;

notify pgrst, 'reload schema';
