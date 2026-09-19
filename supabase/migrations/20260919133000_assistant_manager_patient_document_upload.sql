-- Assistant Managers already have patient workspace and patient-document
-- read/download access. Add only the missing upload capability through the
-- canonical designation bundle so current and future Administration Assistant
-- Managers can use the existing patient-scoped upload lifecycle.
--
-- Existing patient_access(), patient_documents RLS, Storage policies, and
-- restricted document visibility remain authoritative and unchanged.

insert into public.permissions(code, description)
values (
  'patient_documents.upload',
  'Upload documents to permitted patient records'
)
on conflict(code) do update set description = excluded.description;

insert into public.designation_permission_bundles(
  name,
  department_name,
  designation,
  is_active
)
values (
  'Assistant Manager CRM Operations',
  'Administration',
  'Assistant Manager',
  true
)
on conflict(department_name, designation) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

insert into public.designation_permission_bundle_permissions(
  bundle_id,
  permission_id
)
select bundle.id, permission.id
from public.designation_permission_bundles bundle
join public.permissions permission
  on permission.code = 'patient_documents.upload'
where bundle.department_name = 'Administration'
  and bundle.designation = 'Assistant Manager'
  and bundle.is_active
on conflict do nothing;

notify pgrst, 'reload schema';
