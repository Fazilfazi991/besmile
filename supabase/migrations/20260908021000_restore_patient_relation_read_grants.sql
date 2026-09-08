-- Operational reports and scheduling embed patient display fields through
-- PostgREST relationships. PostgreSQL also requires SELECT on the related table.
-- Keep writes governed by the existing patient migrations and RLS policies.

do $$
begin
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'patients'
      and relation.relkind = 'r'
      and relation.relrowsecurity
  ) then
    raise exception 'Refusing Data API grant: public.patients is missing or RLS is disabled';
  end if;
end
$$;

grant select on table public.patients to authenticated;
grant all privileges on table public.patients to service_role;
revoke all on table public.patients from anon;
