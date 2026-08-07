-- Converts a CRM lead into a patient atomically while retaining the original lead.
alter table public.crm_leads
  add column if not exists converted_patient_id uuid references public.patients(id) on delete restrict;

create unique index if not exists crm_leads_converted_patient_unique_idx
  on public.crm_leads(converted_patient_id)
  where converted_patient_id is not null;

create index if not exists crm_leads_converted_patient_idx
  on public.crm_leads(converted_patient_id);

insert into public.crm_lead_statuses(name, sort_order)
values ('Converted', 11)
on conflict (name) do update set sort_order = excluded.sort_order;

create or replace function public.convert_lead_to_patient(target_lead uuid, requested_patient_number text)
returns table(patient_id uuid, patient_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.crm_leads%rowtype;
  new_patient public.patients%rowtype;
  source_name text;
  patient_source text;
  context_note text;
begin
  if auth.uid() is null
    or not public.has_permission('crm.manage_all')
    or not public.has_permission('patients.create') then
    raise exception 'You do not have permission to convert this lead to a patient.' using errcode = '42501';
  end if;

  if nullif(btrim(requested_patient_number), '') is null then
    raise exception 'Patient ID is required.' using errcode = '22023';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead and archived_at is null
  for update;

  if lead_row.id is null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if lead_row.converted_patient_id is not null then
    raise exception 'This lead has already been converted to a patient.' using errcode = '23505';
  end if;
  if exists (select 1 from public.patients where patient_number = btrim(requested_patient_number)) then
    raise exception 'That Patient ID is already in use. Choose a different ID.' using errcode = '23505';
  end if;

  select name into source_name from public.crm_lead_sources where id = lead_row.source_id;
  patient_source := case
    when source_name ilike '%website%' then 'Website'
    when source_name ilike '%walk%' then 'Walk-in'
    when source_name ilike '%referral%' then 'Referral'
    when source_name ilike '%instagram%' or source_name ilike '%social%' then 'Social media'
    else 'Other'
  end;

  insert into public.patients(patient_number, full_name, phone, gender, address, source, status, tags, created_by)
  values (
    btrim(requested_patient_number), lead_row.full_name, lead_row.phone, lead_row.gender,
    nullif(btrim(lead_row.location), ''), patient_source, 'active', array['converted_lead'], auth.uid()
  )
  returning * into new_patient;

  context_note := concat_ws(E'\n',
    'Converted from CRM lead on ' || to_char(now(), 'YYYY-MM-DD HH24:MI TZ'),
    nullif('Reason for enquiry: ' || nullif(btrim(lead_row.reason_for_enquiry), ''), 'Reason for enquiry: '),
    nullif('Lead notes: ' || nullif(btrim(lead_row.remarks), ''), 'Lead notes: ')
  );
  if context_note is not null then
    insert into public.patient_notes(patient_id, note_type, content, visibility, created_by)
    values (new_patient.id, 'administrative', context_note, 'management_only', auth.uid());
  end if;

  update public.crm_leads
  set converted_at = now(),
      converted_patient_id = new_patient.id,
      status_id = (select id from public.crm_lead_statuses where name = 'Converted' limit 1),
      updated_at = now()
  where id = lead_row.id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'lead_converted_to_patient', 'crm_lead', lead_row.id,
    jsonb_build_object('patient_id', new_patient.id, 'patient_number', new_patient.patient_number));

  return query select new_patient.id, new_patient.slug;
end;
$$;

revoke all on function public.convert_lead_to_patient(uuid, text) from public, anon, authenticated;
grant execute on function public.convert_lead_to_patient(uuid, text) to authenticated;

notify pgrst, 'reload schema';
