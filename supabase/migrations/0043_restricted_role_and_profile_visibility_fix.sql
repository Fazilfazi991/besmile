-- Repair legacy role-name compatibility and restrict employee-directory reads.
create or replace function public.role_has_permission(subject_role public.app_role, permission_code text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare allowed boolean; legacy_role text;
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    execute 'select exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code=$1 and p.code=$2)' into allowed using subject_role,permission_code;
  else
    legacy_role := case subject_role::text
      when 'chairman' then 'Chairman'
      when 'director' then 'Director'
      when 'general_manager' then 'General Manager'
      when 'psychologist' then 'Psychologist'
      when 'social_worker' then 'Social Worker'
      when 'intern' then 'Intern'
      when 'guest_sales' then 'Guest – Sales'
      else initcap(replace(subject_role::text,'_',' '))
    end;
    execute 'select exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role::text=$1 and p.code=$2)' into allowed using legacy_role,permission_code;
  end if;
  return coalesce(allowed,false);
end $$;

drop policy if exists "profiles readable by signed in users" on public.profiles;
drop policy if exists "profiles readable by authorized users" on public.profiles;
create policy "profiles readable by authorized users" on public.profiles for select to authenticated
using(id=auth.uid() or public.has_permission('employees.view') or public.has_permission('employees.manage'));
