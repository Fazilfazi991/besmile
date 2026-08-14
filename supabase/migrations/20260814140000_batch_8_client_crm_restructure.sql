-- Batch 8: retain the canonical CRM model while allowing an authorized, explicit
-- existing-client link during conversion. Names are never used for matching.

create or replace function public.convert_lead_to_client(
  target_lead uuid,
  requested_client_number text default null,
  existing_client uuid default null
)
returns table(client_id uuid, client_slug text, linked_existing boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.crm_leads%rowtype;
  client_row public.patients%rowtype;
  source_name text;
  client_source text;
begin
  if (select auth.uid()) is null
    or not public.has_permission('crm.manage_all')
    or not public.has_permission('patients.create') then
    raise exception 'You do not have permission to convert this lead to a client.' using errcode = '42501';
  end if;

  select * into lead_row from public.crm_leads where id = target_lead and archived_at is null for update;
  if lead_row.id is null then raise exception 'Lead not found.' using errcode = 'P0002'; end if;
  if lead_row.converted_patient_id is not null then raise exception 'This lead has already been converted to a client.' using errcode = '23505'; end if;

  if existing_client is not null then
    select * into client_row from public.patients where id = existing_client and deleted_at is null for update;
    if client_row.id is null then raise exception 'Selected client is unavailable.' using errcode = 'P0002'; end if;
    if nullif(btrim(client_row.phone), '') is null or btrim(client_row.phone) <> btrim(lead_row.phone) then
      raise exception 'Existing-client linking requires an exact phone-number match.' using errcode = '22023';
    end if;
  else
    if nullif(btrim(requested_client_number), '') is null then raise exception 'Client ID is required.' using errcode = '22023'; end if;
    if exists (select 1 from public.patients where patient_number = btrim(requested_client_number)) then raise exception 'That Client ID is already in use. Choose a different ID.' using errcode = '23505'; end if;
    select name into source_name from public.crm_lead_sources where id = lead_row.source_id;
    client_source := case when source_name ilike '%website%' then 'Website' when source_name ilike '%walk%' then 'Walk-in' when source_name ilike '%referral%' then 'Referral' when source_name ilike '%instagram%' or source_name ilike '%social%' then 'Social media' else 'Other' end;
    insert into public.patients(patient_number, full_name, phone, gender, address, source, status, tags, created_by)
    values (btrim(requested_client_number), lead_row.full_name, lead_row.phone, lead_row.gender, nullif(btrim(lead_row.location), ''), client_source, 'active', array['converted_lead'], (select auth.uid()))
    returning * into client_row;
  end if;

  update public.crm_leads
  set converted_at = now(), converted_patient_id = client_row.id,
      status_id = (select id from public.crm_lead_statuses where name = 'Converted' limit 1), updated_at = now()
  where id = lead_row.id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values ((select auth.uid()), case when existing_client is null then 'lead_converted_to_client' else 'lead_linked_to_existing_client' end, 'crm_lead', lead_row.id, jsonb_build_object('client_id', client_row.id, 'client_number', client_row.patient_number, 'source_id', lead_row.source_id));
  return query select client_row.id, client_row.slug, existing_client is not null;
end;
$$;

revoke all on function public.convert_lead_to_client(uuid, text, uuid) from public, anon;
grant execute on function public.convert_lead_to_client(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
