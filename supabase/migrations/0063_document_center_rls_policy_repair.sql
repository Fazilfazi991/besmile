-- Repair document-center RLS drift on live databases that still have the broad
-- early MVP storage policy or incomplete document/share policies.
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

drop policy if exists "documents visible to signed in" on public.documents;
drop policy if exists "documents shared with audience" on public.documents;
drop policy if exists "documents managers write" on public.documents;
drop policy if exists "document shares visible to audience" on public.document_shares;
drop policy if exists "document shares managers write" on public.document_shares;

create policy "documents shared with audience"
on public.documents
for select
to authenticated
using (
  public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
  or exists (
    select 1
    from public.document_shares share
    where share.document_id = documents.id
      and (share.shared_with_all or share.profile_id = auth.uid())
  )
);

create policy "documents managers write"
on public.documents
for all
to authenticated
using (
  public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
  or (public.current_role() = 'general_manager' and uploaded_by = auth.uid())
)
with check (
  public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
  or (public.current_role() = 'general_manager' and uploaded_by = auth.uid())
);

create policy "document shares visible to audience"
on public.document_shares
for select
to authenticated
using (
  shared_with_all
  or profile_id = auth.uid()
  or public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
);

create policy "document shares managers write"
on public.document_shares
for all
to authenticated
using (
  public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
)
with check (
  public.has_permission('documents.manage')
  or public.has_permission('documents.employee.manage')
);

drop policy if exists "employee document downloads" on storage.objects;
drop policy if exists "document downloads for authorized records" on storage.objects;
create policy "document downloads for authorized records"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    public.has_permission('documents.manage')
    or public.has_permission('documents.employee.manage')
    or exists (
      select 1
      from public.documents document
      where document.storage_path = name
        and exists (
          select 1
          from public.document_shares share
          where share.document_id = document.id
            and (share.shared_with_all or share.profile_id = auth.uid())
        )
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
