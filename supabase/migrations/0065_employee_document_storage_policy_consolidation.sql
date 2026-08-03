-- Consolidate employee document upload controls after live policy inspection.
--
-- Live blocker found on project ksmqzxncdvuxiabypjth:
--   policy "employee document uploads"
--   with check ((bucket_id = 'employee-documents') AND (owner_id = auth.uid()::text))
--
-- PostgreSQL combines permissive RLS policies with OR logic, so that broad
-- INSERT policy bypassed the stricter 0064 guard. This migration removes only
-- employee-document INSERT policies and recreates one effective guarded path.
-- It intentionally preserves existing SELECT/download policies.

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

drop policy if exists "employee document uploads" on storage.objects;
drop policy if exists "document uploads by owner or management" on storage.objects;
drop policy if exists "employee documents guarded uploads" on storage.objects;

create policy "employee documents guarded uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and lower(coalesce(storage.extension(name), '')) in ('pdf', 'jpg', 'jpeg', 'png', 'webp')
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  )
  and (
    case
      when coalesce(metadata->>'size', '') ~ '^[0-9]+$'
        then (metadata->>'size')::bigint
      else 0
    end
  ) between 1 and 10485760
  and storage.filename(name) !~ '[<>:"\\|?*]'
  and lower(storage.filename(name)) !~ '(^|\.)(exe|js|mjs|cjs|html?|svg|zip|bat|cmd|com|scr|ps1|vbs|jar|msi)(\.|$)'
  and (
    (
      (
        public.has_permission('documents.manage')
        or public.has_permission('documents.employee.manage')
      )
      and (storage.foldername(name))[1] = 'company'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      owner_id = auth.uid()::text
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);
