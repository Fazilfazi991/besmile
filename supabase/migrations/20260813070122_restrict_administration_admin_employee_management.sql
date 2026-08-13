-- Employee-management is a management boundary. Operational CRM permissions
-- remain available to Administration/Admin staff, but employee directory and
-- lifecycle permissions are never effective for an ordinary staff profile.

delete from public.designation_permission_bundle_permissions bundle_permission
using public.designation_permission_bundles bundle, public.permissions permission
where bundle_permission.bundle_id = bundle.id
  and bundle_permission.permission_id = permission.id
  and bundle.name = 'Administration Admin'
  and permission.code = any(array[
    'employees.view',
    'employees.manage',
    'employees.create',
    'employees.edit',
    'employees.status.manage',
    'employees.remove',
    'employees.delete'
  ]);

create or replace function public.has_permission(permission_code text, subject_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles subject
    left join public.departments department on department.id = subject.department_id
    where subject.id = subject_id
      and subject.status = 'active'
      and (
        subject.role = 'super_admin'
        or (
          (
            permission_code <> all(array[
              'employees.view',
              'employees.manage',
              'employees.create',
              'employees.edit',
              'employees.status.manage',
              'employees.remove',
              'employees.delete'
            ])
            or subject.role::text in ('chairman', 'director', 'general_manager')
          )
          and (
            public.role_has_permission(subject.role, permission_code)
            or exists (
              select 1
              from public.user_permission_grants grant_row
              join public.permissions permission on permission.id = grant_row.permission_id
              where grant_row.profile_id = subject.id
                and permission.code = permission_code
                and grant_row.revoked_at is null
                and grant_row.starts_at <= now()
                and (grant_row.expires_at is null or grant_row.expires_at > now())
            )
            or exists (
              select 1
              from public.designation_permission_bundles bundle
              join public.designation_permission_bundle_permissions bundle_permission on bundle_permission.bundle_id = bundle.id
              join public.permissions permission on permission.id = bundle_permission.permission_id
              where bundle.is_active
                and permission.code = permission_code
                and lower(bundle.department_name) = lower(coalesce(department.name, ''))
                and lower(bundle.designation) = lower(coalesce(subject.designation, ''))
            )
          )
        )
      )
  )
$$;

revoke all on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;
