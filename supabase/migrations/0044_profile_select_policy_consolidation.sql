-- Consolidate unknown legacy profile SELECT policies into one least-privilege rule.
do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies
    where schemaname='public' and tablename='profiles' and cmd='SELECT'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end $$;

create policy "profiles readable by authorized users" on public.profiles for select to authenticated
using(id=auth.uid() or public.has_permission('employees.view') or public.has_permission('employees.manage'));
