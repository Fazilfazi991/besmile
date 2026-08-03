-- Enforce company/employee document upload file rules at the Supabase Storage
-- RLS layer. The application validates the same allowlist before upload; this
-- policy prevents direct storage/API uploads from bypassing those checks.

drop policy if exists "employee document uploads" on storage.objects;
drop policy if exists "document uploads by owner or management" on storage.objects;

create policy "document uploads by owner or management"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and (
    public.has_permission('documents.manage')
    or public.has_permission('documents.employee.manage')
    or (
      owner_id = auth.uid()::text
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  and coalesce((metadata->>'size')::bigint, 0) between 1 and 10485760
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  )
  and name !~ '\\.\\.'
  and name !~ '[<>:"\\|?*]'
);
