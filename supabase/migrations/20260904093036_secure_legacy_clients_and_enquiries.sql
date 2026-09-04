-- Canonicalize the deny-by-default boundary for two legacy foundation tables.
-- Active client and enquiry workflows use public.patients and public.crm_leads;
-- these tables remain available only to trusted server/database roles.

do $$
declare
  missing_columns text[];
begin
  if to_regclass('public.clients') is null then
    raise exception 'Required legacy table public.clients is missing';
  end if;
  if to_regclass('public.enquiries') is null then
    raise exception 'Required legacy table public.enquiries is missing';
  end if;

  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from (values
    ('public', 'clients', 'id'),
    ('public', 'clients', 'name'),
    ('public', 'clients', 'status'),
    ('public', 'enquiries', 'id'),
    ('public', 'enquiries', 'client_id'),
    ('public', 'enquiries', 'owner_id'),
    ('public', 'enquiries', 'status'),
    ('public', 'enquiries', 'subject')
  ) as required(schema_name, table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = required.schema_name
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if cardinality(missing_columns) > 0 then
    raise exception 'Legacy table contract mismatch; missing columns: %', missing_columns;
  end if;
end
$$;

alter table public.clients enable row level security;
alter table public.enquiries enable row level security;

revoke all privileges on table public.clients from anon, authenticated;
revoke all privileges on table public.enquiries from anon, authenticated;

drop policy if exists "legacy clients are internal only" on public.clients;
create policy "legacy clients are internal only"
on public.clients
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "legacy enquiries are internal only" on public.enquiries;
create policy "legacy enquiries are internal only"
on public.enquiries
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.clients is
  'Legacy internal table. Active client workflows use public.patients.';
comment on table public.enquiries is
  'Legacy internal table. Active enquiry workflows use public.crm_leads.';

notify pgrst, 'reload schema';
