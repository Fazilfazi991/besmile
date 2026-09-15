-- E5: canonical Assistant Manager CRM operations, collaborative meeting notes,
-- and patient-document upload hardening. Production application is deferred;
-- this migration is designed for QA qualification first.

insert into public.permissions(code, description) values
  ('documents.employee.view', 'View official and company documents shared with the employee')
on conflict(code) do update set description = excluded.description;

-- The existing designation bundle architecture applies permission sets without
-- tying authorization to a person's name, email, or UUID.
insert into public.designation_permission_bundles(
  name, department_name, designation, is_active
)
values (
  'Assistant Manager CRM Operations',
  'Administration',
  'Assistant Manager',
  true
)
on conflict(department_name, designation) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

with bundle as (
  select id
  from public.designation_permission_bundles
  where department_name = 'Administration'
    and designation = 'Assistant Manager'
), allowed_permissions as (
  select id
  from public.permissions
  where code = any(array[
    'admin.shell',
    'dashboard.view',
    'crm.manage_all',
    'crm.import',
    'leads.view','leads.create','leads.edit','leads.assign','leads.manage_status',
    'sales.view','sales.edit','sales.manage_status','sales.documents.view','sales.documents.manage',
    'documents.view','documents.employee.view'
  ])
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, allowed_permissions.id
from bundle cross join allowed_permissions
on conflict do nothing;

-- crm.manage_all is the existing all-record operational scope. Hard deletion is
-- a separate protected capability and is not part of the Assistant Manager bundle.
drop policy if exists "crm leads scoped delete" on public.crm_leads;
drop policy if exists "crm leads protected delete" on public.crm_leads;
create policy "crm leads protected delete"
on public.crm_leads for delete to authenticated
using(public.has_permission('crm.delete'));

drop policy if exists "crm sales scoped delete" on public.crm_sales;
drop policy if exists "crm sales protected delete" on public.crm_sales;
create policy "crm sales protected delete"
on public.crm_sales for delete to authenticated
using(public.has_permission('crm.delete'));

-- The legacy SELECT policy called crm_sale_can_view(id), whose STABLE helper
-- queries crm_sales itself. During INSERT ... RETURNING that helper cannot see
-- the row being inserted because it uses the statement-start snapshot, so a
-- legitimate conversion is rolled back by the SELECT policy. Authorize the
-- returned row from its linked lead instead, without bypassing lead scope.
create or replace function public.crm_sale_lead_can_view(target_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.crm_leads lead
    where lead.id = target_lead
      and (
        public.has_permission('crm.manage_all')
        or (
          public.has_permission('crm.view_team')
          and public.in_management_tree(lead.assigned_to)
        )
        or (
          lead.assigned_to = auth.uid()
          and public.has_permission('sales.view')
        )
      )
  )
$$;

revoke all on function public.crm_sale_lead_can_view(uuid) from public, anon;
grant execute on function public.crm_sale_lead_can_view(uuid) to authenticated;

drop policy if exists "crm sales scoped read" on public.crm_sales;
create policy "crm sales scoped read"
on public.crm_sales for select to authenticated
using(public.crm_sale_lead_can_view(lead_id));

-- Convert in one database transaction so a sale insert cannot succeed while the
-- lead state update fails. The unique lead_id constraint makes retries idempotent.
create or replace function public.convert_crm_lead_to_sale(
  target_lead uuid,
  sale_amount numeric,
  sale_currency text default 'INR',
  sale_closing_date date default current_date,
  sale_service_details text default null,
  sale_first_session_date date default null,
  sale_second_session_date date default null,
  sale_third_session_date date default null,
  sale_notes text default null
)
returns public.crm_sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  lead_row public.crm_leads%rowtype;
  sale_row public.crm_sales%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if sale_amount is null or sale_amount < 0 then
    raise exception 'Sale amount must be zero or greater.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(sale_currency, '')), '') is null then
    raise exception 'Sale currency is required.' using errcode = '22023';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead
  for update;

  if not found
    or not public.crm_lead_can_edit(lead_row.assigned_to)
    or not (public.has_permission('crm.manage_all') or public.has_permission('sales.edit'))
  then
    raise exception 'Permission denied for lead conversion' using errcode = '42501';
  end if;

  select * into sale_row
  from public.crm_sales
  where lead_id = target_lead;

  if found then
    return sale_row;
  end if;

  insert into public.crm_sales(
    lead_id, closing_date, sale_value, currency, service_details,
    first_session_date, second_session_date, third_session_date, notes, created_by
  ) values (
    target_lead,
    coalesce(sale_closing_date, current_date),
    sale_amount,
    upper(btrim(sale_currency)),
    nullif(btrim(coalesce(sale_service_details, '')), ''),
    sale_first_session_date,
    sale_second_session_date,
    sale_third_session_date,
    nullif(btrim(coalesce(sale_notes, '')), ''),
    auth.uid()
  )
  returning * into sale_row;

  update public.crm_leads
  set converted_at = coalesce(converted_at, now()),
      updated_at = now()
  where id = target_lead;

  return sale_row;
end
$$;

revoke all on function public.convert_crm_lead_to_sale(uuid,numeric,text,date,text,date,date,date,text)
from public, anon;
grant execute on function public.convert_crm_lead_to_sale(uuid,numeric,text,date,text,date,date,date,text)
to authenticated;

-- Keep the canonical meeting visibility predicate in the migration history.
-- SECURITY DEFINER is necessary here only to avoid RLS recursion while checking
-- participant membership; it returns a boolean and explicitly requires auth.uid().
create or replace function public.meeting_visible(target_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.has_permission('meetings.manage')
    or exists(
      select 1 from public.meetings meeting
      where meeting.id = target_meeting
        and meeting.organizer_id = (select auth.uid())
    )
    or exists(
      select 1 from public.meetings meeting
      where meeting.id = target_meeting
        and meeting.host_user_id = (select auth.uid())
    )
    or exists(
      select 1 from public.meeting_participants participant
      where participant.meeting_id = target_meeting
        and participant.employee_id = (select auth.uid())
    )
  )
$$;

revoke all on function public.meeting_visible(uuid) from public, anon;
grant execute on function public.meeting_visible(uuid) to authenticated;

-- Existing meeting_notes remains the structured Minutes-of-Meeting record.
-- These immutable entries provide collaborative, per-author notes without
-- overwriting that contract or another participant's writing.
create table if not exists public.meeting_note_entries (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  content text not null check(length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists meeting_note_entries_meeting_created_idx
on public.meeting_note_entries(meeting_id, created_at, id);

alter table public.meeting_note_entries enable row level security;

drop policy if exists "meeting note entries authorized read" on public.meeting_note_entries;
create policy "meeting note entries authorized read"
on public.meeting_note_entries for select to authenticated
using(public.meeting_visible(meeting_id));

drop policy if exists "meeting note entries participant create" on public.meeting_note_entries;
create policy "meeting note entries participant create"
on public.meeting_note_entries for insert to authenticated
with check(
  author_profile_id = auth.uid()
  and exists(
    select 1
    from public.meetings meeting
    where meeting.id = meeting_note_entries.meeting_id
      and meeting.status = 'scheduled'
      and (
        meeting.organizer_id = auth.uid()
        or meeting.host_user_id = auth.uid()
        or exists(
          select 1
          from public.meeting_participants participant
          where participant.meeting_id = meeting.id
            and participant.employee_id = auth.uid()
        )
      )
  )
);

revoke all on table public.meeting_note_entries from public, anon;
revoke update, delete on table public.meeting_note_entries from authenticated;
grant select, insert on table public.meeting_note_entries to authenticated;

-- Data API privileges are explicit; patient_access and document visibility RLS
-- remain authoritative. This restores both upload initialization and finalize.
grant select, insert, update on table public.patient_documents to authenticated;
revoke all on table public.patient_documents from anon;

-- Only an authenticated uploader with a pending metadata row for an authorized
-- patient may create the matching private Storage object. CASE prevents unsafe
-- UUID casts for malformed direct API paths.
drop policy if exists "patient storage upload" on storage.objects;
create policy "patient storage upload"
on storage.objects for insert to authenticated
with check(
  bucket_id = 'patient-documents'
  and owner_id = auth.uid()::text
  and case
    when array_length(storage.foldername(name), 1) = 5
      and (storage.foldername(name))[1] = 'patients'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'documents'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[5] ~ '^v[1-9][0-9]*$'
    then exists(
      select 1
      from public.patient_documents document
      where document.id = ((storage.foldername(name))[4])::uuid
        and document.patient_id = ((storage.foldername(name))[2])::uuid
        and document.uploaded_by = auth.uid()
        and document.storage_key like 'pending-%'
        and public.patient_access(document.patient_id)
        and public.has_permission('patient_documents.upload')
    )
    else false
  end
);
