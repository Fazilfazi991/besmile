-- Match the existing Assistant Manager scheduling grant architecture.
-- Patient/document RLS and private document visibility are deliberately unchanged.
-- No company-document, clinical-note, upload, edit, or delete permissions are granted.
insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select assistant.id, permission.id,
  coalesce((select manager.id from public.profiles manager
    where manager.role::text in ('general_manager', 'General Manager')
    order by manager.created_at limit 1), assistant.id),
  'Assistant Manager patient-scoped document read access'
from public.profiles assistant
join public.permissions permission
  on permission.code in ('patient_documents.view', 'patient_documents.download')
where assistant.is_employee = true
  and assistant.status::text in ('active', 'intern', 'probation')
  and assistant.role::text = 'staff'
  and assistant.designation = 'Assistant Manager'
  and not exists (
    select 1 from public.user_permission_grants existing
    where existing.profile_id = assistant.id
      and existing.permission_id = permission.id
      and existing.revoked_at is null
  );
