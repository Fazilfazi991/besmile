-- Additive compatibility permissions plus assigned-patient and action-scoped CRM access.
insert into public.permissions(code,description) values
 ('patients.view_assigned','View only patients explicitly assigned to the user'),
 ('patients.view_all','View all patient summaries when explicitly authorized'),
 ('sales.view','View authorized sales'),('sales.edit','Edit authorized sales'),('sales.manage_status','Manage authorized sales status'),
 ('sales.documents.view','View authorized sales documents'),('sales.documents.manage','Manage authorized sales documents')
on conflict(code) do update set description=excluded.description;

create table if not exists public.patient_access_assignments (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade, assigned_by uuid references public.profiles(id) on delete set null,
 assignment_type text not null default 'care_team' check(assignment_type in ('care_team','intern','supervisor')),
 starts_at timestamptz not null default now(), ends_at timestamptz, created_at timestamptz not null default now(),
 unique(patient_id,profile_id,assignment_type)
);
create index if not exists patient_access_assignments_profile_idx on public.patient_access_assignments(profile_id,patient_id) where ends_at is null;
alter table public.patient_access_assignments enable row level security;
grant select,insert,update,delete on public.patient_access_assignments to authenticated;

create or replace function public.patient_is_assigned(patient uuid, subject uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.patient_access_assignments assignment where assignment.patient_id=patient and assignment.profile_id=subject and assignment.starts_at<=now() and (assignment.ends_at is null or assignment.ends_at>now()))
$$;
create or replace function public.patient_access(patient uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.patients p where p.id=patient and p.deleted_at is null and (
   public.has_permission('patients.view_all')
   or (public.has_permission('patients.view') and (p.assigned_psychologist_id=auth.uid() or public.patient_is_assigned(p.id)))
   or (public.has_permission('patients.view_assigned') and public.patient_is_assigned(p.id))
 ))
$$;
drop policy if exists "patient assignments readable" on public.patient_access_assignments;
create policy "patient assignments readable" on public.patient_access_assignments for select to authenticated using(profile_id=auth.uid() or public.has_permission('patients.edit'));
drop policy if exists "patient assignments managed" on public.patient_access_assignments;
create policy "patient assignments managed" on public.patient_access_assignments for all to authenticated using(public.has_permission('patients.edit')) with check(public.has_permission('patients.edit') and assigned_by=auth.uid());

alter table public.crm_sales add column if not exists status text not null default 'open' check(status in ('open','pending','won','lost','cancelled'));
create table if not exists public.crm_sales_documents (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.crm_sales(id) on delete cascade,
 file_name text not null, storage_path text not null unique, mime_type text, uploaded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create index if not exists crm_sales_documents_sale_idx on public.crm_sales_documents(sale_id,created_at desc) where archived_at is null;
alter table public.crm_sales_documents enable row level security;
grant select,insert,update on public.crm_sales_documents to authenticated;

create or replace function public.crm_lead_can_view(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission('crm.manage_all')
   or (public.has_permission('crm.view_team') and public.in_management_tree(target))
   or (target=auth.uid() and (public.has_permission('crm.view_assigned') or public.has_permission('leads.view')))
$$;
create or replace function public.crm_lead_can_edit(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission('crm.manage_all')
   or (public.has_permission('crm.view_team') and public.in_management_tree(target) and public.has_permission('leads.edit'))
   or (target=auth.uid() and public.has_permission('leads.edit'))
$$;
create or replace function public.crm_sale_can_view(sale uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.crm_sales s join public.crm_leads l on l.id=s.lead_id where s.id=sale and (
   public.has_permission('crm.manage_all') or (public.has_permission('crm.view_team') and public.in_management_tree(l.assigned_to))
   or (l.assigned_to=auth.uid() and (public.has_permission('sales.view') or public.has_permission('crm.view_assigned')))
 ))
$$;
create or replace function public.crm_sale_can_edit(sale uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.crm_sales s join public.crm_leads l on l.id=s.lead_id where s.id=sale and (
   public.has_permission('crm.manage_all') or (public.has_permission('crm.view_team') and public.in_management_tree(l.assigned_to) and public.has_permission('sales.edit'))
   or (l.assigned_to=auth.uid() and public.has_permission('sales.edit'))
 ))
$$;

create or replace function public.enforce_crm_lead_permission() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.assigned_to is distinct from old.assigned_to and not public.has_permission('leads.assign') and not public.has_permission('crm.manage_all') then raise exception 'Permission denied for lead assignment'; end if;
 if (new.status_id is distinct from old.status_id or new.temperature is distinct from old.temperature) and not public.has_permission('leads.manage_status') and not public.has_permission('crm.manage_all') then raise exception 'Permission denied for lead status'; end if;
 if (new.full_name,new.phone,new.gender,new.profession,new.reason_for_enquiry,new.location,new.source_id,new.remarks,new.archived_at,new.converted_at) is distinct from (old.full_name,old.phone,old.gender,old.profession,old.reason_for_enquiry,old.location,old.source_id,old.remarks,old.archived_at,old.converted_at) and not public.has_permission('leads.edit') and not public.has_permission('crm.manage_all') then raise exception 'Permission denied for lead editing'; end if;
 return new;
end $$;
drop trigger if exists crm_leads_permission_guard on public.crm_leads;
create trigger crm_leads_permission_guard before update on public.crm_leads for each row execute function public.enforce_crm_lead_permission();

create or replace function public.enforce_crm_sale_permission() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status is distinct from old.status and not public.has_permission('sales.manage_status') and not public.has_permission('crm.manage_all') then raise exception 'Permission denied for sales status'; end if;
 if (new.closing_date,new.sale_value,new.currency,new.service_details,new.first_session_date,new.second_session_date,new.third_session_date,new.notes) is distinct from (old.closing_date,old.sale_value,old.currency,old.service_details,old.first_session_date,old.second_session_date,old.third_session_date,old.notes) and not public.has_permission('sales.edit') and not public.has_permission('crm.manage_all') then raise exception 'Permission denied for sales editing'; end if;
 return new;
end $$;
drop trigger if exists crm_sales_permission_guard on public.crm_sales;
create trigger crm_sales_permission_guard before update on public.crm_sales for each row execute function public.enforce_crm_sale_permission();

drop policy if exists "crm leads access" on public.crm_leads;
drop policy if exists "crm leads scoped read" on public.crm_leads;
drop policy if exists "crm leads scoped create" on public.crm_leads;
drop policy if exists "crm leads scoped update" on public.crm_leads;
drop policy if exists "crm leads scoped delete" on public.crm_leads;
create policy "crm leads scoped read" on public.crm_leads for select to authenticated using(public.crm_lead_can_view(assigned_to));
create policy "crm leads scoped create" on public.crm_leads for insert to authenticated with check(public.has_permission('leads.create') and (assigned_to=auth.uid() or public.has_permission('leads.assign') or public.has_permission('crm.manage_all')));
create policy "crm leads scoped update" on public.crm_leads for update to authenticated using(public.crm_lead_can_view(assigned_to)) with check(public.crm_lead_can_view(assigned_to));
create policy "crm leads scoped delete" on public.crm_leads for delete to authenticated using(public.has_permission('crm.manage_all'));

drop policy if exists "crm sales access" on public.crm_sales;
drop policy if exists "crm sales scoped read" on public.crm_sales;
drop policy if exists "crm sales scoped create" on public.crm_sales;
drop policy if exists "crm sales scoped update" on public.crm_sales;
drop policy if exists "crm sales scoped delete" on public.crm_sales;
create policy "crm sales scoped read" on public.crm_sales for select to authenticated using(public.crm_sale_can_view(id));
create policy "crm sales scoped create" on public.crm_sales for insert to authenticated with check(
 public.has_permission('crm.manage_all') or (
   public.has_permission('sales.edit') and exists(
     select 1 from public.crm_leads lead where lead.id=lead_id and public.crm_lead_can_edit(lead.assigned_to)
   )
 )
);
create policy "crm sales scoped update" on public.crm_sales for update to authenticated using(public.crm_sale_can_view(id)) with check(public.crm_sale_can_view(id));
create policy "crm sales scoped delete" on public.crm_sales for delete to authenticated using(public.has_permission('crm.manage_all'));
drop policy if exists "sales documents scoped read" on public.crm_sales_documents;
drop policy if exists "sales documents scoped create" on public.crm_sales_documents;
drop policy if exists "sales documents scoped update" on public.crm_sales_documents;
create policy "sales documents scoped read" on public.crm_sales_documents for select to authenticated using(archived_at is null and public.crm_sale_can_view(sale_id) and public.has_permission('sales.documents.view'));
create policy "sales documents scoped create" on public.crm_sales_documents for insert to authenticated with check(uploaded_by=auth.uid() and public.crm_sale_can_edit(sale_id) and public.has_permission('sales.documents.manage'));
create policy "sales documents scoped update" on public.crm_sales_documents for update to authenticated using(public.crm_sale_can_edit(sale_id) and public.has_permission('sales.documents.manage')) with check(public.crm_sale_can_edit(sale_id) and public.has_permission('sales.documents.manage'));

insert into storage.buckets(id,name,public) values('sales-documents','sales-documents',false) on conflict(id) do update set public=false;
drop policy if exists "sales document uploads" on storage.objects;
drop policy if exists "sales document reads" on storage.objects;
drop policy if exists "sales document updates" on storage.objects;
create policy "sales document uploads" on storage.objects for insert to authenticated with check(bucket_id='sales-documents' and owner_id=auth.uid()::text and public.has_permission('sales.documents.manage'));
create policy "sales document reads" on storage.objects for select to authenticated using(bucket_id='sales-documents' and exists(select 1 from public.crm_sales_documents document where document.storage_path=name and public.crm_sale_can_view(document.sale_id) and public.has_permission('sales.documents.view')));
create policy "sales document updates" on storage.objects for update to authenticated using(bucket_id='sales-documents' and exists(select 1 from public.crm_sales_documents document where document.storage_path=name and public.crm_sale_can_edit(document.sale_id) and public.has_permission('sales.documents.manage'))) with check(bucket_id='sales-documents' and owner_id=auth.uid()::text and public.has_permission('sales.documents.manage'));

do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
   insert into public.role_permissions(role,permission_id)
   select seed.role_name::public.employee_role,p.id from (values
     ('Intern',array['patients.view_assigned','clients.documents.view','appointments.documents.view']::text[]),
     ('Guest – Sales',array['sales.view','sales.edit','sales.manage_status','sales.documents.view','sales.documents.manage']::text[])
   ) seed(role_name,codes) join public.permissions p on p.code=any(seed.codes) on conflict do nothing;
 elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
   insert into public.role_permissions(role_id,permission_id)
   select r.id,p.id from public.roles r join public.permissions p on (r.code='intern' and p.code=any(array['patients.view_assigned','clients.documents.view','appointments.documents.view'])) or (r.code='guest_sales' and p.code=any(array['sales.view','sales.edit','sales.manage_status','sales.documents.view','sales.documents.manage'])) on conflict do nothing;
 end if;
end $$;
