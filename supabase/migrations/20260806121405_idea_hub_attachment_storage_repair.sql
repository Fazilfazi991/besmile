-- Repair the production Storage surface omitted from the schema-only Idea Hub repair.
-- Idea attachments stay private and are only exposed through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'idea-attachments',
  'idea-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "idea attachment uploads" on storage.objects;
create policy "idea attachment uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'idea-attachments'
  and owner_id = (select auth.uid()::text)
  and public.has_permission('ideas.create')
  and (storage.foldername(name))[1] = 'ideas'
  and (storage.foldername(name))[3] = 'attachments'
  and array_length(storage.foldername(name), 1) = 4
  and exists (
    select 1
    from public.ideas idea
    where idea.id::text = (storage.foldername(name))[2]
      and idea.submitted_by = (select auth.uid())
      and idea.status = 'Submitted'
      and idea.archived_at is null
  )
);

drop policy if exists "idea attachment reads" on storage.objects;
create policy "idea attachment reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'idea-attachments'
  and exists (
    select 1
    from public.idea_attachments attachment
    join public.ideas idea on idea.id = attachment.idea_id
    where attachment.storage_key = name
      and attachment.deleted_at is null
      and idea.archived_at is null
      and public.has_permission('ideas.view')
  )
);

drop policy if exists "idea attachment deletes" on storage.objects;
create policy "idea attachment deletes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'idea-attachments'
  and exists (
    select 1
    from public.idea_attachments attachment
    where attachment.storage_key = name
      and attachment.uploaded_by = (select auth.uid())
  )
);
