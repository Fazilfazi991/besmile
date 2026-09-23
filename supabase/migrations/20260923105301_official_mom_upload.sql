-- MOM-only extension of existing Official Documents access. No role grants,
-- general upload/manage permissions, shared audience, or generated types change.
begin;

create unique index documents_mom_storage_path_idx on public.documents(storage_path)
where document_type = 'minutes_of_meeting';

create or replace function public.official_mom_upload_allowed()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.has_permission('documents.manage')
    or public.has_permission('documents.employee.manage')
    or public.has_permission('documents.official.generate')
  )
$$;
revoke all on function public.official_mom_upload_allowed() from public, anon;
grant execute on function public.official_mom_upload_allowed() to authenticated;

create or replace function public.official_mom_own_path(object_name text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select (select auth.uid()) is not null
    and array_length(storage.foldername(object_name), 1) = 3
    and (storage.foldername(object_name))[1] = 'company'
    and (storage.foldername(object_name))[2] = (select auth.uid())::text
    and (storage.foldername(object_name))[3] = 'mom'
    and storage.filename(object_name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+'
    and lower(coalesce(storage.extension(object_name), '')) in ('pdf', 'jpg', 'jpeg', 'png', 'webp')
    and storage.filename(object_name) !~ '[<>:"\\|?*[:cntrl:]]'
    and position('..' in storage.filename(object_name)) = 0
    and lower(storage.filename(object_name)) !~ '(^|\.)(exe|js|mjs|cjs|html?|svg|zip|bat|cmd|com|scr|ps1|vbs|jar|msi)(\.|$)'
$$;
revoke all on function public.official_mom_own_path(text) from public, anon;
grant execute on function public.official_mom_own_path(text) to authenticated;

-- Restrictive: even existing manager INSERT policies cannot forge MOM uploader
-- attribution. Existing non-MOM inserts remain untouched.
create policy "MOM insert attribution and metadata"
on public.documents as restrictive for insert to authenticated
with check (
  document_type is distinct from 'minutes_of_meeting'
  or (
    public.official_mom_upload_allowed()
    and uploaded_by = (select auth.uid())
    and public.official_mom_own_path(storage_path)
    and source_type = 'uploaded'
    and category = 'Official:Minutes of Meeting (MOM)'
    and length(btrim(title)) between 1 and 140
    and file_size between 1 and 10485760
    and file_name = substring(storage.filename(storage_path) from 38)
    and case mime_type
      when 'application/pdf' then lower(storage.extension(storage_path)) = 'pdf'
      when 'image/jpeg' then lower(storage.extension(storage_path)) in ('jpg', 'jpeg')
      when 'image/png' then lower(storage.extension(storage_path)) = 'png'
      when 'image/webp' then lower(storage.extension(storage_path)) = 'webp'
      else false end
    and generated_at is null and page_count is null
    and official_status is null and related_profile_id is null
  )
);

create policy "MOM own create"
on public.documents for insert to authenticated
with check (
  public.official_mom_upload_allowed()
  and document_type = 'minutes_of_meeting'
  and source_type = 'uploaded'
  and uploaded_by = (select auth.uid())
  and public.official_mom_own_path(storage_path)
);

-- Matches existing generation-only own-document visibility. Existing manager
-- and explicitly shared-document SELECT policies continue to apply unchanged.
create policy "MOM own read"
on public.documents for select to authenticated
using (
  public.official_mom_upload_allowed()
  and document_type = 'minutes_of_meeting'
  and source_type = 'uploaded'
  and uploaded_by = (select auth.uid())
  and public.official_mom_own_path(storage_path)
);

create policy "MOM own file upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and public.official_mom_upload_allowed()
  and public.official_mom_own_path(name)
);

-- Needed for Storage INSERT RETURNING as well as signed reads; excludes listing.
create policy "MOM own file access"
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and not storage.allow_only_operation('object.list')
  and public.official_mom_upload_allowed()
  and public.official_mom_own_path(name)
);

-- Only rollback of a failed upload, never deletion of a saved MOM document.
create policy "MOM orphan upload cleanup"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and public.official_mom_upload_allowed()
  and public.official_mom_own_path(name)
  and not exists (select 1 from public.documents document where document.storage_path = name)
);

-- Mirrors the existing official-generation audit trigger's protected write to
-- audit_logs. Not an exposed RPC, and actor identity is always auth.uid().
create or replace function public.official_mom_audit_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.uploaded_by <> (select auth.uid()) then
    raise exception 'MOM uploader must match the authenticated user';
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values ((select auth.uid()), 'official_document_uploaded', 'documents', new.id,
    jsonb_build_object('document_type', new.document_type, 'file_name', new.file_name));
  return new;
end
$$;
revoke all on function public.official_mom_audit_event() from public, anon, authenticated;
create trigger documents_mom_audit after insert on public.documents
for each row when (new.document_type = 'minutes_of_meeting')
execute function public.official_mom_audit_event();

-- Preserve MOM identity after insertion, including for existing managers.
-- A type change must not provide a two-step way to forge uploader attribution.
create or replace function public.official_mom_preserve_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.uploaded_by is distinct from old.uploaded_by
    or new.storage_path is distinct from old.storage_path
    or new.document_type is distinct from old.document_type
    or new.source_type is distinct from old.source_type then
    raise exception 'MOM uploader, file and type cannot be reassigned';
  end if;
  return new;
end
$$;
revoke all on function public.official_mom_preserve_identity() from public, anon, authenticated;
create trigger documents_mom_identity before update on public.documents
for each row when (old.document_type = 'minutes_of_meeting' or new.document_type = 'minutes_of_meeting')
execute function public.official_mom_preserve_identity();

commit;
