-- E5 corrective release: creation of normal operational official PDFs is a
-- separate capability from managing every employee/company document.
begin;

insert into public.permissions(code, description)
values ('documents.official.generate', 'Generate operational official documents')
on conflict (code) do update set description = excluded.description;

with bundle as (
  select id from public.designation_permission_bundles
  where department_name = 'Administration'
    and designation = 'Assistant Manager'
    and is_active
), permission as (
  select id from public.permissions where code = 'documents.official.generate'
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, permission.id from bundle cross join permission
on conflict do nothing;

-- The profile table includes private HR fields. Expose only the five fields
-- needed by the Offer Letter picker, not a broad profiles SELECT policy.
create or replace function public.search_official_document_employees(search_text text)
returns table(id uuid, full_name text, designation text, joining_date date, department_name text)
language sql stable security definer set search_path = ''
as $$
  select profile.id, profile.full_name, profile.designation,
    profile.joining_date, department.name
  from public.profiles profile
  left join public.departments department on department.id = profile.department_id
  where (select auth.uid()) is not null
    and public.has_permission('documents.official.generate')
    and length(replace(replace(replace(btrim(coalesce(search_text, '')), '%', ''), '_', ''), ',', '')) between 2 and 80
    and profile.is_employee and profile.workforce_visible
    and profile.role <> 'director'
    and profile.status in ('active', 'intern', 'probation')
    and profile.full_name ilike '%' || replace(replace(replace(btrim(search_text), '%', ''), '_', ''), ',', '') || '%'
  order by profile.full_name, profile.id
  limit 20
$$;

revoke all on function public.search_official_document_employees(text) from public, anon;
grant execute on function public.search_official_document_employees(text) to authenticated;

create or replace function public.official_document_employee_is_selectable(target_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.has_permission('documents.official.generate')
    and exists (
      select 1 from public.profiles profile
      where profile.id = target_profile
        and profile.is_employee and profile.workforce_visible
        and profile.role <> 'director'
        and profile.status in ('active', 'intern', 'probation')
    )
$$;

revoke all on function public.official_document_employee_is_selectable(uuid) from public, anon;
grant execute on function public.official_document_employee_is_selectable(uuid) to authenticated;

-- The operational creator can insert/read only their own generated history.
-- Existing shared-document and manager policies remain unchanged.
create policy "operational official documents own read"
on public.documents for select to authenticated
using (
  public.has_permission('documents.official.generate')
  and source_type = 'official_generated'
  and official_status = 'available'
  and uploaded_by = (select auth.uid())
  and storage_path like 'company/' || (select auth.uid())::text || '/official/%'
);

create policy "operational official documents own create"
on public.documents for insert to authenticated
with check (
  public.has_permission('documents.official.generate')
  and source_type = 'official_generated'
  and official_status = 'available'
  and uploaded_by = (select auth.uid())
  and storage_path like 'company/' || (select auth.uid())::text || '/official/%'
  and mime_type = 'application/pdf'
  and category like 'Official:%'
  and document_type in (
    'offer_letter', 'appointment_letter', 'experience_letter',
    'general_report', 'sales_report', 'custom_official_document'
  )
  and (
    related_profile_id is null
    or public.official_document_employee_is_selectable(related_profile_id)
  )
);

-- Supabase Storage INSERT ... RETURNING needs matching SELECT access. Both
-- policies are limited to a PDF in the creator's own official namespace;
-- they do not permit company-root uploads, updates, or listing.
create policy "operational official PDF upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 3
  and (storage.foldername(name))[1] = 'company'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'official'
  and lower(coalesce(storage.extension(name), '')) = 'pdf'
  and storage.filename(name) !~ '[<>:"\\|?*]'
  and lower(storage.filename(name))
    !~ '(^|\.)(exe|js|mjs|cjs|html?|svg|zip|bat|cmd|com|scr|ps1|vbs|jar|msi)(\.|$)'
  and public.has_permission('documents.official.generate')
);

create policy "operational official PDF own access"
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and not storage.allow_only_operation('object.list')
  and array_length(storage.foldername(name), 1) = 3
  and (storage.foldername(name))[1] = 'company'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'official'
  and lower(coalesce(storage.extension(name), '')) = 'pdf'
  and public.has_permission('documents.official.generate')
);

-- A failed history INSERT may need to remove the just-uploaded orphan. Do not
-- allow removal once an official document row references the object.
create policy "operational official orphan PDF cleanup"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 3
  and (storage.foldername(name))[1] = 'company'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] = 'official'
  and public.has_permission('documents.official.generate')
  and not exists (
    select 1 from public.documents document
    where document.storage_path = name
  )
);

-- Preserve the existing audited download RPC but authorize the operational
-- creator only for their own available generated document.
create or replace function public.record_official_document_download(document_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.documents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'permission denied'; end if;
  select * into target from public.documents
  where id = record_official_document_download.document_id
    and source_type = 'official_generated' and official_status = 'available';
  if not found then raise exception 'document unavailable'; end if;
  if not (
    public.has_permission('documents.manage')
    or public.has_permission('documents.employee.manage')
    or (
      public.has_permission('documents.official.generate')
      and target.uploaded_by = (select auth.uid())
      and target.storage_path like 'company/' || (select auth.uid())::text || '/official/%'
    )
  ) then raise exception 'permission denied'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (
    (select auth.uid()), 'official_document_downloaded', 'documents', target.id,
    jsonb_build_object('document_type', target.document_type,
      'related_profile_id', target.related_profile_id, 'file_name', target.file_name)
  );
end
$$;

revoke all on function public.record_official_document_download(uuid) from public, anon;
grant execute on function public.record_official_document_download(uuid) to authenticated;

commit;
