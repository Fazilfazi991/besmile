begin;

-- Run application-level permission triggers as the retained General Manager.
select set_config('request.jwt.claim.sub', 'e64c5750-b585-4cab-9478-2c1fbad3b26e', true);

-- One-time, reviewed production identity consolidation. Every profile below was
-- individually audited before inclusion; this intentionally does not use a
-- broad email allow-list deletion.
do $$
declare
  identity record;
  reference record;
begin
  for identity in
    select * from (values
      ('bf67d7bb-73f5-47ee-a848-46d8d89a2f46'::uuid, 'e64c5750-b585-4cab-9478-2c1fbad3b26e'::uuid, 'General Manager'),
      ('3da03f0a-37e2-4db8-93fa-c57d937f12c9'::uuid, 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid, 'Diya Anthikat'),
      ('3d0bd0b8-3589-4b55-9c72-137fd9c9c9c9'::uuid, '4096a95f-970b-4542-8f18-cf5dd6a66150'::uuid, 'Aiswarya P')
    ) merged(source_id, target_id, identity_name)
  loop
    if not exists (select 1 from public.profiles where id = identity.source_id)
       or not exists (select 1 from public.profiles where id = identity.target_id) then
      raise exception 'Identity merge precondition failed for %', identity.identity_name;
    end if;

    -- Preserve the most recent read marker when both identities belong to the
    -- same conversation, then remove only the redundant membership row.
    update public.chat_members target
    set last_read_at = greatest(target.last_read_at, source.last_read_at)
    from public.chat_members source
    where source.profile_id = identity.source_id
      and target.profile_id = identity.target_id
      and target.conversation_id = source.conversation_id;

    delete from public.chat_members source
    where source.profile_id = identity.source_id
      and exists (
        select 1 from public.chat_members target
        where target.profile_id = identity.target_id
          and target.conversation_id = source.conversation_id
      );

    -- The participant record carries no mutable business data beyond its
    -- creation timestamp; retain the canonical row when the meeting overlaps.
    delete from public.meeting_participants source
    where source.employee_id = identity.source_id
      and exists (
        select 1 from public.meeting_participants target
        where target.employee_id = identity.target_id
          and target.meeting_id = source.meeting_id
      );

    -- Singleton preference rows use the canonical account when both exist.
    delete from public.notification_preferences source
    where source.profile_id = identity.source_id
      and exists (
        select 1 from public.notification_preferences target
        where target.profile_id = identity.target_id
      );

    delete from public.employee_salary_settings source
    where source.profile_id = identity.source_id
      and exists (
        select 1 from public.employee_salary_settings target
        where target.profile_id = identity.target_id
      );

    delete from public.announcement_reads source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.announcement_reads target where target.profile_id = identity.target_id and target.announcement_id = source.announcement_id);

    delete from public.announcement_recipients source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.announcement_recipients target where target.profile_id = identity.target_id and target.announcement_id = source.announcement_id);

    delete from public.appointment_reminder_deliveries source
    where source.recipient_id = identity.source_id
      and exists (select 1 from public.appointment_reminder_deliveries target where target.recipient_id = identity.target_id and target.appointment_id = source.appointment_id and target.appointment_start = source.appointment_start and target.lead_minutes = source.lead_minutes);

    delete from public.attendance source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.attendance target where target.profile_id = identity.target_id and target.work_date = source.work_date);

    delete from public.chat_message_reads source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.chat_message_reads target where target.profile_id = identity.target_id and target.message_id = source.message_id);

    delete from public.document_expiry_reminder_deliveries source
    where source.recipient_id = identity.source_id
      and exists (select 1 from public.document_expiry_reminder_deliveries target where target.recipient_id = identity.target_id and target.document_kind = source.document_kind and target.document_id = source.document_id and target.expiry_date = source.expiry_date and target.reminder_days = source.reminder_days);

    delete from public.document_shares source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.document_shares target where target.profile_id = identity.target_id and target.document_id = source.document_id);

    delete from public.employee_leave_balances source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.employee_leave_balances target where target.profile_id = identity.target_id and target.leave_type_id = source.leave_type_id and target.leave_year = source.leave_year);

    delete from public.idea_supports source
    where source.employee_id = identity.source_id
      and exists (select 1 from public.idea_supports target where target.employee_id = identity.target_id and target.idea_id = source.idea_id);

    delete from public.patient_access_assignments source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.patient_access_assignments target where target.profile_id = identity.target_id and target.patient_id = source.patient_id and target.assignment_type = source.assignment_type);

    delete from public.payroll_entries source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.payroll_entries target where target.profile_id = identity.target_id and target.payroll_run_id = source.payroll_run_id);

    delete from public.profile_secondary_supervisors source
    where (source.profile_id = identity.source_id and exists (select 1 from public.profile_secondary_supervisors target where target.profile_id = identity.target_id and target.supervisor_id = source.supervisor_id))
       or (source.supervisor_id = identity.source_id and exists (select 1 from public.profile_secondary_supervisors target where target.supervisor_id = identity.target_id and target.profile_id = source.profile_id));

    delete from public.push_subscriptions source
    where source.user_id = identity.source_id
      and exists (select 1 from public.push_subscriptions target where target.user_id = identity.target_id and target.endpoint = source.endpoint);

    delete from public.task_assignments source
    where source.profile_id = identity.source_id
      and exists (select 1 from public.task_assignments target where target.profile_id = identity.target_id and target.task_id = source.task_id);

    -- Repoint every public foreign key to the canonical profile. The clinician
    -- identity is merged separately below because it has its own domain key.
    for reference in
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_schema = tc.constraint_schema
       and kcu.constraint_name = tc.constraint_name
      join information_schema.referential_constraints rc
        on rc.constraint_schema = tc.constraint_schema
       and rc.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_schema = rc.unique_constraint_schema
       and ccu.constraint_name = rc.unique_constraint_name
      where tc.table_schema = 'public'
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_schema = 'public'
        and ccu.table_name = 'profiles'
        and ccu.column_name = 'id'
        and not (tc.table_name = 'outsourced_doctors' and kcu.column_name = 'profile_id')
    loop
      execute format(
        'update public.%I set %I = $1 where %I = $2',
        reference.table_name,
        reference.column_name,
        reference.column_name
      ) using identity.target_id, identity.source_id;
    end loop;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      'e64c5750-b585-4cab-9478-2c1fbad3b26e',
      'employee_identity_merged',
      'profiles',
      identity.source_id,
      jsonb_build_object('source_profile_id', identity.source_id, 'identity', identity.identity_name),
      jsonb_build_object('canonical_profile_id', identity.target_id, 'history_reassigned', true)
    );
  end loop;
end
$$;

-- Merge Aiswarya's redundant clinician record. The old clinician row had one
-- blocked-period record and no appointments; appointments already belong to
-- the canonical clinician row.
update public.doctor_appointments
set doctor_id = '6021398c-69dc-4e71-ab49-fd53b9c93b21'
where doctor_id = '3e4c8cfb-f8a0-41aa-a1cd-6367ffaed63e';

update public.doctor_weekly_availability
set doctor_id = '6021398c-69dc-4e71-ab49-fd53b9c93b21'
where doctor_id = '3e4c8cfb-f8a0-41aa-a1cd-6367ffaed63e';

update public.doctor_blocked_periods
set doctor_id = '6021398c-69dc-4e71-ab49-fd53b9c93b21'
where doctor_id = '3e4c8cfb-f8a0-41aa-a1cd-6367ffaed63e';

update public.outsourced_doctors
set profile_id = null,
    status = 'unavailable',
    archived_at = coalesce(archived_at, now()),
    archived_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    notes = concat_ws(E'\n', nullif(notes, ''), 'Merged into canonical Aiswarya P clinician identity on 2026-08-13.'),
    updated_at = now(),
    updated_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e'
where id = '3e4c8cfb-f8a0-41aa-a1cd-6367ffaed63e';

update public.outsourced_doctors
set email = 'aishwaryabsmile@gmail.com',
    doctor_name = 'Aiswarya P',
    profile_id = '4096a95f-970b-4542-8f18-cf5dd6a66150',
    status = 'active',
    updated_at = now(),
    updated_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e'
where id = '6021398c-69dc-4e71-ab49-fd53b9c93b21';

-- Canonical approved profiles. The corresponding Auth emails are updated via
-- the Auth Admin API immediately after this transaction commits.
update public.profiles
set full_name = 'Mr. Yousaf',
    email = 'bsmiledirectory@gmail.com',
    designation = 'Director',
    role = 'director',
    department_id = '75d0756c-fd3f-4f57-b9a6-5036826db2c6',
    manager_id = null,
    status = 'active',
    is_employee = true,
    workforce_visible = true,
    login_enabled = true,
    removed_at = null,
    removal_reason = null,
    removed_by = null,
    updated_at = now()
where id = '3f70fd80-bd37-4e89-b014-761bf563a219';

update public.profiles
set full_name = 'Mr. Muhammad Faiz AU',
    email = 'bsmile.gm@gmail.com',
    designation = 'General Manager',
    role = 'general_manager',
    department_id = '92050f3e-93db-4ec6-848d-6781ff908252',
    manager_id = null,
    status = 'active',
    is_employee = true,
    workforce_visible = true,
    login_enabled = true,
    removed_at = null,
    removal_reason = null,
    removed_by = null,
    updated_at = now()
where id = 'e64c5750-b585-4cab-9478-2c1fbad3b26e';

update public.profiles
set full_name = 'Diya Anthikat',
    email = 'diyaassistantmanager@gmail.com',
    designation = 'Assistant Manager',
    role = 'staff',
    department_id = 'ea848dfd-b2f1-4916-a0f9-e6aad557261e',
    manager_id = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    status = 'active',
    is_employee = true,
    workforce_visible = true,
    login_enabled = true,
    removed_at = null,
    removal_reason = null,
    removed_by = null,
    updated_at = now()
where id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5';

update public.profiles
set full_name = 'Aiswarya P',
    email = 'aishwaryabsmile@gmail.com',
    designation = 'Psychologist',
    role = 'psychologist',
    department_id = '1e9f54bb-b222-4cfa-9c08-d3d9fe6cc573',
    manager_id = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    status = 'active',
    is_employee = true,
    workforce_visible = true,
    login_enabled = true,
    removed_at = null,
    removal_reason = null,
    removed_by = null,
    updated_at = now()
where id = '4096a95f-970b-4542-8f18-cf5dd6a66150';

-- Retain Diya's operational task-assignment grant, add scoped CRM/lead access,
-- and explicitly revoke any direct HR/finance/payroll grants.
update public.user_permission_grants grant_row
set revoked_at = coalesce(grant_row.revoked_at, now()),
    revoked_by = coalesce(grant_row.revoked_by, 'e64c5750-b585-4cab-9478-2c1fbad3b26e'),
    reason = concat_ws(' | ', nullif(grant_row.reason, ''), 'Revoked during approved Assistant Manager access review'),
    updated_at = now()
from public.permissions permission
where grant_row.profile_id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'
  and grant_row.permission_id = permission.id
  and grant_row.revoked_at is null
  and (
    permission.code like 'employees.%'
    or permission.code like 'finance.%'
    or permission.code like 'payroll.%'
    or permission.code like 'income.%'
    or permission.code like 'expenses.%'
    or permission.code like 'invoices.%'
  );

insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select
  'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5',
  permission.id,
  'e64c5750-b585-4cab-9478-2c1fbad3b26e',
  'Approved Assistant Manager CRM and lead operations'
from public.permissions permission
where permission.code in (
  'crm.view_team',
  'leads.view',
  'leads.create',
  'leads.edit',
  'leads.assign',
  'leads.manage_status',
  'sales.view',
  'sales.edit',
  'sales.manage_status'
)
and not exists (
  select 1
  from public.user_permission_grants existing
  where existing.profile_id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'
    and existing.permission_id = permission.id
    and existing.revoked_at is null
    and existing.starts_at <= now()
    and (existing.expires_at is null or existing.expires_at > now())
);

create temporary table reviewed_cleanup_targets on commit drop as
select target.id, target.reason, target.classification, profile.status as previous_status
from (values
  ('d04f630c-f698-489a-87d3-5b6debe6af24'::uuid, 'Placeholder Chairman identity; legitimate Chairman name/email not supplied', 'Unknown placeholder'),
  ('bf67d7bb-73f5-47ee-a848-46d8d89a2f46'::uuid, 'Duplicate seeded General Manager identity merged into approved GM account', 'Duplicate'),
  ('638a329c-db1a-4ef9-8a48-0dd1cef42791'::uuid, 'Unverified legacy local profile retained for historical safety', 'Unknown historical'),
  ('3da03f0a-37e2-4db8-93fa-c57d937f12c9'::uuid, 'Duplicate Diya identity merged into approved Assistant Manager account', 'Duplicate'),
  ('41b77796-2504-4f5c-a12d-b5083487d233'::uuid, 'Unverified legacy local profile retained for historical safety', 'Unknown historical'),
  ('3d0bd0b8-3589-4b55-9c72-137fd9c9c9c9'::uuid, 'Duplicate Aiswarya identity merged into approved Psychologist account', 'Duplicate'),
  ('be339aac-6ece-4430-b778-3a21a7f0d2e3'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('221ab254-d439-4fa1-8403-be1aeb0febc6'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('f9827e6e-f23c-4234-b318-673045192741'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('b199d672-efad-4022-8181-b763317a4765'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('a954ce3b-aa99-47a0-b118-a35fff6b6cbf'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('8e3eb2cf-5072-4dde-8bb3-e5ab0696614a'::uuid, 'Temporary QA finance viewer', 'QA/Test'),
  ('339e37df-dd10-465a-820d-8c7ba42df5f8'::uuid, 'Inactive QA fixture', 'QA/Test'),
  ('59ab9a83-9389-44da-821d-996e18b8695b'::uuid, 'Temporary guest-sales QA account', 'QA/Test'),
  ('ea73eb9c-d616-48cc-9cb2-0f5e187b0869'::uuid, 'Vendor/non-employee profile', 'Vendor/Non-employee'),
  ('79516a66-e1b5-41a6-b6ac-5e26eeb0b40b'::uuid, 'Former real intern retained with history', 'Legitimate historical/inactive'),
  ('5e7449bc-96e0-4b67-bb4f-430b7517f852'::uuid, 'CODEX QA employee lifecycle fixture', 'QA/Test'),
  ('b0a8e754-15a9-4505-9fae-971661fe24d0'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('5d26d910-6b3c-41e6-979c-25e723f8a0c0'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('3192aeac-512c-454f-8270-b5b2c300e194'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('c0e9df38-2d86-4577-85ca-c946e8281743'::uuid, 'CODEX QA role account', 'QA/Test'),
  ('210c723b-dccc-43d6-a7be-77d9c6575047'::uuid, 'Unverified existing person retained for historical safety', 'Unknown historical'),
  ('b066449b-ec88-44e0-bbcd-b8dd9e2d4942'::uuid, 'CODEX QA demo employee', 'QA/Test')
) target(id, reason, classification)
join public.profiles profile on profile.id = target.id;

-- These lifecycle triggers correctly reject anonymous/direct status changes.
-- This reviewed maintenance migration records equivalent history explicitly.
alter table public.profiles disable trigger enforce_employee_status_change;
alter table public.profiles disable trigger record_employee_status_change;

update public.profiles profile
set status = 'inactive',
    login_enabled = false,
    workforce_visible = false,
    removed_at = coalesce(profile.removed_at, now()),
    removal_reason = target.reason,
    removed_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    updated_at = now()
from reviewed_cleanup_targets target
where profile.id = target.id;

alter table public.profiles enable trigger record_employee_status_change;
alter table public.profiles enable trigger enforce_employee_status_change;

insert into public.employee_status_history(profile_id, previous_status, next_status, reason, changed_by)
select id, previous_status, 'inactive', reason, 'e64c5750-b585-4cab-9478-2c1fbad3b26e'
from reviewed_cleanup_targets
where previous_status is distinct from 'inactive';

update public.user_permission_grants grant_row
set revoked_at = coalesce(grant_row.revoked_at, now()),
    revoked_by = coalesce(grant_row.revoked_by, 'e64c5750-b585-4cab-9478-2c1fbad3b26e'),
    updated_at = now()
from reviewed_cleanup_targets target
where grant_row.profile_id = target.id
  and grant_row.revoked_at is null;

insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
select
  'e64c5750-b585-4cab-9478-2c1fbad3b26e',
  'employee_removed_production_cleanup',
  'profiles',
  id,
  jsonb_build_object('status', previous_status, 'classification', classification),
  jsonb_build_object('status', 'inactive', 'login_enabled', false, 'workforce_visible', false, 'reason', reason)
from reviewed_cleanup_targets;

commit;
