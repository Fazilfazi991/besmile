-- Additive access alignment for client operations, scoped lead conversion,
-- Sales Coordinator imports, and the existing psychologist settlement UI.
insert into public.permissions(code, description)
values ('leads.convert_to_patient', 'Convert an accessible CRM lead into a client/patient')
on conflict(code) do update set description = excluded.description;

-- Keep the existing designation architecture. These upserts reactivate or
-- create bundles but never replace their accumulated permission rows.
insert into public.designation_permission_bundles(name, department_name, designation, is_active)
values ('Assistant Manager CRM Operations', 'Administration', 'Assistant Manager', true)
on conflict(department_name, designation) do update
set is_active = true,
    updated_at = now();

insert into public.designation_permission_bundles(name, department_name, designation, is_active)
values ('Psychology Psychologist', 'Psychology', 'Psychologist', true)
on conflict(department_name, designation) do update
set is_active = true,
    updated_at = now();

insert into public.designation_permission_bundles(name, department_name, designation, is_active)
values ('Operations Sales Coordinator', 'Operations', 'Sales Coordinator', true)
on conflict(department_name, designation) do update
set is_active = true,
    updated_at = now();

with target_bundles as (
  select id, department_name, designation
  from public.designation_permission_bundles
  where is_active
    and (
      (department_name = 'Administration' and designation = 'Assistant Manager')
      or (department_name = 'Psychology' and designation = 'Psychologist')
      or (department_name = 'Operations' and designation = 'Sales Coordinator')
    )
), requested_permissions as (
  select bundle.id as bundle_id, permission.id as permission_id
  from target_bundles bundle
  join public.permissions permission on (
    bundle.department_name = 'Administration'
    and bundle.designation = 'Assistant Manager'
    and permission.code = any(array[
      'leads.convert_to_patient',
      'patients.view_all','patients.create','patients.edit','patients.assign',
      'patient_documents.view','patient_documents.download','patient_documents.upload',
      'patient_documents.archive','patient_documents.replace',
      'patient_notes.view','patient_notes.create','patient_notes.edit',
      'clinical_notes.view','clinical_notes.create','clinical_notes.edit',
      'patient_sessions.create','patient_activity.view',
      'appointments.view','appointments.create','appointments.update',
      'appointments.reschedule','appointments.cancel','appointments.update_status'
    ])
  ) or (
    bundle.department_name = 'Psychology'
    and bundle.designation = 'Psychologist'
    and permission.code = any(array[
      'leads.convert_to_patient','patients.view_all','patients.assign',
      'patient_documents.archive','patient_documents.replace'
    ])
  ) or (
    bundle.department_name = 'Operations'
    and bundle.designation = 'Sales Coordinator'
    and permission.code = any(array['crm.import','leads.create'])
  )
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle_id, permission_id
from requested_permissions
on conflict do nothing;

-- Mirror the approved Psychologist additions through either supported role
-- permission schema so QA fixtures and production resolve the same capability.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'Psychologist'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = any(array[
      'leads.convert_to_patient','patients.view_all','patients.assign',
      'patient_documents.archive','patient_documents.replace'
    ])
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    cross join public.permissions permission
    where role.code = 'psychologist'
      and permission.code = any(array[
        'leads.convert_to_patient','patients.view_all','patients.assign',
        'patient_documents.archive','patient_documents.replace'
      ])
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema for client access seeding';
  end if;
end $$;

-- Preserve the existing management path. The new operational path is useful
-- only for leads already visible through the canonical CRM scope helper.
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
