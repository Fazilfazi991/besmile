-- General Manager owns the CRM workspace, including atomic lead conversion and
-- the dedicated import route. Earlier grants covered modern lead permissions
-- but omitted the legacy permissions still enforced by these two operations.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code in ('crm.manage_all', 'crm.import')
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code in ('crm.manage_all', 'crm.import')
    where role.code = 'general_manager'
    on conflict do nothing;
  end if;
end $$;

-- The legacy import policies predated `crm.import` and checked only the narrow
-- Chairman/Director helper. Route authorization and RLS must enforce the same
-- explicit capability.
drop policy if exists "crm import management" on public.crm_import_batches;
create policy "crm import permission"
on public.crm_import_batches for all to authenticated
using (public.has_permission('crm.import'))
with check (public.has_permission('crm.import'));

drop policy if exists "crm import rows management" on public.crm_import_rows;
create policy "crm import rows permission"
on public.crm_import_rows for all to authenticated
using (public.has_permission('crm.import'))
with check (public.has_permission('crm.import'));
