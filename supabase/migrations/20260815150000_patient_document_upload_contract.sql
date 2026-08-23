-- Bind patient-document creation to the authenticated uploader and to the
-- application-owned storage key scheme.  The original INSERT policies were
-- permissive, so the old policy could authorize a forged uploaded_by even
-- alongside a later stricter policy.

-- Match the existing application validator so direct Storage calls cannot
-- bypass its type and 20 MiB limits.
update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
where id = 'patient-documents';

-- There must be exactly one permissive INSERT policy for patient documents.
drop policy if exists "patient documents write" on public.patient_documents;
drop policy if exists "patient documents upload create" on public.patient_documents;

create policy "patient documents upload create"
on public.patient_documents
for insert
to authenticated
with check (
  public.patient_access(patient_id)
  and public.has_permission('patient_documents.upload')
  and uploaded_by = (select auth.uid())
  and storage_provider = 'supabase'
  and storage_bucket = 'patient-documents'
  and (
    -- The API creates a short-lived row before the object key can contain the
    -- generated document id.  Finalization below only permits its canonical
    -- key, and the pending row is not readable through document RLS.
    storage_key ~ '^pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or storage_key ~ (
      '^patients/' || patient_id::text || '/documents/' || id::text
      || '/v' || version::text || '/[^/]+$'
    )
  )
);

-- The existing two-step API flow can only turn its own pending row into the
-- canonical patient/document/version path.  It cannot use finalization to
-- point a document row at an arbitrary object.
drop policy if exists "patient documents upload finalize" on public.patient_documents;
create policy "patient documents upload finalize"
on public.patient_documents
for update
to authenticated
using (
  public.patient_access(patient_id)
  and public.has_permission('patient_documents.upload')
  and uploaded_by = (select auth.uid())
  and storage_key ~ '^pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
with check (
  public.patient_access(patient_id)
  and public.has_permission('patient_documents.upload')
  and uploaded_by = (select auth.uid())
  and storage_provider = 'supabase'
  and storage_bucket = 'patient-documents'
  and (
    storage_key ~ (
      '^patients/' || patient_id::text || '/documents/' || id::text
      || '/v' || version::text || '/[^/]+$'
    )
    -- Preserve the API's failed-upload cleanup.  A pending row can only be
    -- retained as a soft-deleted record by its own uploader; it can never be
    -- made visible with an arbitrary final storage key.
    or (
      storage_key ~ '^pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and deleted_at is not null
      and deleted_by = (select auth.uid())
    )
  )
);

-- The upload key has always been generated as:
-- patients/<patient uuid>/documents/<document uuid>/v<positive version>/<file>
-- Parse the patient segment safely before handing it to patient_access so a
-- malformed path cannot raise a cast error or become an authorization bypass.
drop policy if exists "patient storage upload" on storage.objects;
drop policy if exists "patient storage canonical upload" on storage.objects;

create policy "patient storage canonical upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'patient-documents'
  and public.has_permission('patient_documents.upload')
  and name ~* '^patients/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[^/]+$'
  and public.patient_access(
    case
      when split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(name, '/', 2)::uuid
      else null
    end
  )
);
