-- The canonical conversion RPC is allowed to perform exactly one lead-status
-- transition after its permission and scope checks. A transaction-local marker
-- distinguishes that atomic operation from ordinary lead edits; no broader
-- status-management permission is granted.
create or replace function public.enforce_crm_lead_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  conversion_transition boolean :=
    nullif(current_setting('app.lead_conversion_target', true), '') = old.id::text
    and old.converted_patient_id is null
    and new.converted_patient_id is not null
    and old.converted_at is null
    and new.converted_at is not null
    and new.status_id = (
      select id from public.crm_lead_statuses
      where name = 'Converted'
      limit 1
    )
    and new.assigned_to is not distinct from old.assigned_to
    and public.has_permission('patients.create')
    and public.has_permission('leads.convert_to_patient')
    and public.crm_lead_can_view(old.assigned_to, old.converted_patient_id);
begin
  if new.assigned_to is distinct from old.assigned_to
    and not public.has_permission('leads.assign')
    and not public.has_permission('crm.manage_all') then
    raise exception 'Permission denied for lead assignment';
  end if;

  if (new.status_id is distinct from old.status_id or new.temperature is distinct from old.temperature)
    and not public.has_permission('leads.manage_status')
    and not public.has_permission('crm.manage_all')
    and not conversion_transition then
    raise exception 'Permission denied for lead status';
  end if;

  if (
    new.full_name, new.phone, new.gender, new.profession,
    new.reason_for_enquiry, new.location, new.source_id, new.remarks,
    new.archived_at, new.converted_at, new.converted_patient_id
  ) is distinct from (
    old.full_name, old.phone, old.gender, old.profession,
    old.reason_for_enquiry, old.location, old.source_id, old.remarks,
    old.archived_at, old.converted_at, old.converted_patient_id
  )
    and not public.has_permission('leads.edit')
    and not public.has_permission('crm.manage_all')
    and not conversion_transition then
    raise exception 'Permission denied for lead editing';
  end if;

  return new;
end;
$$;

create or replace function public.convert_lead_to_patient(
  target_lead uuid,
  requested_patient_number text
)
returns table(patient_id uuid, patient_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.crm_leads%rowtype;
  new_patient public.patients%rowtype;
  source_name text;
  patient_source text;
  context_note text;
  management_path boolean;
begin
  management_path := public.has_permission('crm.manage_all');

  if (select auth.uid()) is null
    or not public.has_permission('patients.create')
    or not (
      management_path
      or public.has_permission('leads.convert_to_patient')
    ) then
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

  if not management_path
    and not public.crm_lead_can_view(lead_row.assigned_to, lead_row.converted_patient_id) then
    raise exception 'You do not have permission to convert this lead to a patient.' using errcode = '42501';
  end if;

  if lead_row.converted_patient_id is not null then
    raise exception 'This lead has already been converted to a patient.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.patients
    where patient_number = btrim(requested_patient_number)
  ) then
    raise exception 'That Patient ID is already in use. Choose a different ID.' using errcode = '23505';
  end if;

  select name into source_name
  from public.crm_lead_sources
  where id = lead_row.source_id;

  patient_source := case
    when source_name ilike '%website%' then 'Website'
    when source_name ilike '%walk%' then 'Walk-in'
    when source_name ilike '%referral%' then 'Referral'
    when source_name ilike '%instagram%' or source_name ilike '%social%' then 'Social media'
    else 'Other'
  end;

  insert into public.patients(
    patient_number, full_name, phone, gender, address,
    source, status, tags, created_by
  ) values (
    btrim(requested_patient_number), lead_row.full_name, lead_row.phone,
    lead_row.gender, nullif(btrim(lead_row.location), ''), patient_source,
    'active', array['converted_lead'], (select auth.uid())
  )
  returning * into new_patient;

  context_note := concat_ws(E'\n',
    'Converted from CRM lead on ' || to_char(now(), 'YYYY-MM-DD HH24:MI TZ'),
    nullif('Reason for enquiry: ' || nullif(btrim(lead_row.reason_for_enquiry), ''), 'Reason for enquiry: '),
    nullif('Lead notes: ' || nullif(btrim(lead_row.remarks), ''), 'Lead notes: ')
  );

  if context_note is not null then
    insert into public.patient_notes(
      patient_id, note_type, content, visibility, created_by
    ) values (
      new_patient.id, 'administrative', context_note,
      'management_only', (select auth.uid())
    );
  end if;

  perform set_config('app.lead_conversion_target', lead_row.id::text, true);

  update public.crm_leads
  set converted_at = now(),
      converted_patient_id = new_patient.id,
      status_id = (
        select id from public.crm_lead_statuses
        where name = 'Converted'
        limit 1
      ),
      updated_at = now()
  where id = lead_row.id;

  perform set_config('app.lead_conversion_target', '', true);

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, after_data
  ) values (
    (select auth.uid()), 'lead_converted_to_patient', 'crm_lead', lead_row.id,
    jsonb_build_object(
      'patient_id', new_patient.id,
      'patient_number', new_patient.patient_number
    )
  );

  return query select new_patient.id, new_patient.slug;
end;
$$;

revoke all on function public.convert_lead_to_patient(uuid, text)
from public, anon, authenticated;
grant execute on function public.convert_lead_to_patient(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
