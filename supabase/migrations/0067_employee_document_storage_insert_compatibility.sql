-- Make the guarded employee document INSERT policy compatible with Supabase
-- Storage SDK uploads.
--
-- Live testing after 0065/0066 showed valid PDF/JPG/JPEG/PNG/WebP uploads still
-- fail with "new row violates row-level security policy". The remaining likely
-- blocker is using storage.objects.metadata MIME/size fields inside INSERT RLS
-- before those fields are suitable for policy evaluation.
--
-- Layered enforcement after this migration:
--   * storage.buckets remains private and enforces declared MIME + max size.
--   * INSERT RLS enforces bucket, owner, path namespace, extension allowlist,
--     and dangerous/suspicious filename rejection.
--   * application/server validation continues enforcing MIME, size, non-empty
--     files, extension and filename safety before writing document metadata.
--
-- This is not malware/content scanning. Bucket MIME checks validate declared
-- MIME metadata; RLS validates object path/name/owner authorization.

begin;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'employee-documents';

drop policy if exists "employee documents guarded uploads" on storage.objects;

create policy "employee documents guarded uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'

  and lower(coalesce(storage.extension(name), ''))
    in ('pdf', 'jpg', 'jpeg', 'png', 'webp')

  and storage.filename(name) !~ '[<>:"\\|?*]'

  and lower(storage.filename(name))
    !~ '(^|\.)(exe|js|mjs|cjs|html?|svg|zip|bat|cmd|com|scr|ps1|vbs|jar|msi)(\.|$)'

  and owner_id = auth.uid()::text

  and (
    (
      (
        public.has_permission('documents.manage')
        or public.has_permission('documents.employee.manage')
      )
      and (storage.foldername(name))[1] = 'company'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or
    (
      (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

commit;
