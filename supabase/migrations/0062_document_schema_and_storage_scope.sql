-- Repair live document-center schema drift and keep private storage aligned with
-- document-record access. This is forward-only and idempotent.
alter table public.documents
  add column if not exists file_name text,
  add column if not exists description text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint check (file_size is null or file_size >= 0),
  add column if not exists review_comment text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at
before update on public.documents
for each row execute function public.touch_updated_at();

create or replace function public.company_document_can_read(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_management()
    or exists (
      select 1
      from public.document_shares share
      where share.document_id = company_document_can_read.document_id
        and (share.shared_with_all or share.profile_id = auth.uid())
    )
$$;

drop policy if exists "document downloads for authorized records" on storage.objects;
create policy "document downloads for authorized records"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    public.is_management()
    or exists (
      select 1
      from public.documents document
      where document.storage_path = name
        and public.company_document_can_read(document.id)
    )
    or exists (
      select 1
      from public.document_submissions submission
      where submission.storage_path = name
        and (
          submission.submitted_by = auth.uid()
          or exists (
            select 1
            from public.document_requests request
            where request.id = submission.request_id
              and public.document_manager_can_manage(request.profile_id)
          )
        )
    )
  )
);
