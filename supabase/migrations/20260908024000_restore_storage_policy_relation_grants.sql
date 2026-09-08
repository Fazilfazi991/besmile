-- Storage object policies evaluate relationship tables before issuing signed
-- URLs. A replay with RLS policies but no table SELECT grants can therefore
-- reject an otherwise-authorized object with an unrelated table error.

do $$
declare
  table_name text;
begin
  foreach table_name in array array['patient_documents', 'crm_sales_documents', 'idea_attachments']
  loop
    if not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relkind = 'r'
        and relation.relrowsecurity
    ) then
      raise exception 'Refusing storage relation grant: public.% is missing or RLS is disabled', table_name;
    end if;
  end loop;
end
$$;

grant select on table
  public.patient_documents,
  public.crm_sales_documents,
  public.idea_attachments
to authenticated;

grant all privileges on table
  public.patient_documents,
  public.crm_sales_documents,
  public.idea_attachments
to service_role;

revoke all on table
  public.patient_documents,
  public.crm_sales_documents,
  public.idea_attachments
from anon;
