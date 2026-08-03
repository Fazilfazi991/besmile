-- Allow Supabase Storage uploads to return the newly inserted object metadata
-- without broadening employee document downloads.
--
-- The existing authorized download policy remains the source of truth for
-- shared/application document retrieval. This policy is intentionally narrow:
-- it lets the authenticated uploader SELECT only objects they own inside the
-- same path namespaces authorized by the guarded INSERT policy. It also
-- excludes object listing through the operation-aware helper available in this
-- live Storage schema.

drop policy if exists "employee document upload return access" on storage.objects;

create policy "employee document upload return access"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = auth.uid()::text
  and not storage.allow_only_operation('object.list')
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
      (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);
