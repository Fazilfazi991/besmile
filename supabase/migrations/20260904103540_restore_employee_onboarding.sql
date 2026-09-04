-- Phase 8E additive recovery of verified active Production contracts.
-- Source behavior recovered from reachable historical migrations; no data rows are copied.

-- Recovered from supabase/migrations/20260814063821_employee_onboarding.sql
-- Batch 5: structured employee onboarding. Recruitment automation is out of scope.

insert into public.permissions(code,description) values
  ('onboarding.view','View employee onboarding'),
  ('onboarding.manage','Manage employee onboarding'),
  ('onboarding.activate','Activate employees from onboarding')
on conflict(code) do update set description=excluded.description;

do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    execute $seed$insert into public.role_permissions(role_id,permission_id)
      select role.id,permission.id from public.roles role cross join public.permissions permission
      where role.code::text in ('chairman','director','general_manager') and permission.code in ('onboarding.view','onboarding.manage','onboarding.activate') on conflict do nothing$seed$;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    execute $seed$insert into public.role_permissions(role,permission_id)
      select (case role.code::text when 'chairman' then 'Chairman' when 'director' then 'Director' else 'General Manager' end)::public.employee_role,permission.id
      from public.roles role cross join public.permissions permission
      where role.code::text in ('chairman','director','general_manager') and permission.code in ('onboarding.view','onboarding.manage','onboarding.activate') on conflict do nothing$seed$;
  end if;
end $$;

create table public.employee_onboardings (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(length(btrim(full_name)) between 2 and 140),
  personal_email text not null check(personal_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text,
  department_id uuid not null references public.departments(id),
  designation text not null check(length(btrim(designation)) between 2 and 120),
  employment_type text,
  employee_status text not null default 'active' check(employee_status in ('active','intern','probation')),
  reporting_manager_id uuid references public.profiles(id),
  expected_joining_date date not null,
  actual_joining_date date,
  onboarding_owner_id uuid not null references public.profiles(id),
  stage text not null default 'documents_pending' check(stage in ('documents_pending','documents_submitted','documents_verified','offer_generated','offer_sent','offer_accepted','joined','onboarding_in_progress','completed','cancelled')),
  offer_status text not null default 'pending' check(offer_status in ('pending','sent','accepted','declined')),
  offer_document_id uuid references public.documents(id),
  offer_generated_at timestamptz,
  offer_generated_by uuid references public.profiles(id),
  offer_sent_at timestamptz,
  offer_sent_by uuid references public.profiles(id),
  offer_accepted_at timestamptz,
  offer_declined_at timestamptz,
  decline_reason text,
  joining_confirmed_at timestamptz,
  joining_confirmed_by uuid references public.profiles(id),
  employee_id uuid unique references public.profiles(id),
  activation_state text not null default 'pending' check(activation_state in ('pending','in_progress','completed','failed')),
  compensation text,
  notes text check(notes is null or length(notes)<=4000),
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((stage='cancelled')=(cancelled_at is not null))
);
create unique index employee_onboardings_open_email_unique on public.employee_onboardings(lower(personal_email)) where stage<>'cancelled';
create index employee_onboardings_stage_joining_idx on public.employee_onboardings(stage,expected_joining_date);
create index employee_onboardings_department_idx on public.employee_onboardings(department_id,stage);
create index employee_onboardings_owner_idx on public.employee_onboardings(onboarding_owner_id,stage);

create table public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.employee_onboardings(id) on delete restrict,
  title text not null check(length(btrim(title)) between 2 and 140),
  is_required boolean not null default true,
  status text not null default 'pending' check(status in ('pending','submitted','verified','rejected')),
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint check(file_size is null or file_size between 1 and 10485760),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  rejection_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(onboarding_id,title),
  check((status='pending' and storage_path is null) or (status in ('submitted','verified','rejected') and storage_path is not null)),
  check((status='verified')=(verified_at is not null)),
  check(status<>'rejected' or length(btrim(rejection_reason))>=3)
);
create index onboarding_documents_progress_idx on public.onboarding_documents(onboarding_id,is_required,status);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.employee_onboardings(id) on delete restrict,
  title text not null check(length(btrim(title)) between 2 and 180),
  is_required boolean not null default true,
  assigned_to uuid references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','completed')),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(onboarding_id,title),
  check((status='completed')=(completed_at is not null))
);
create index onboarding_tasks_progress_idx on public.onboarding_tasks(onboarding_id,is_required,status);

create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.employee_onboardings(id) on delete restrict,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index onboarding_events_timeline_idx on public.onboarding_events(onboarding_id,created_at desc);

alter table public.documents add column if not exists onboarding_id uuid references public.employee_onboardings(id);
create index if not exists documents_onboarding_created_idx on public.documents(onboarding_id,created_at desc) where onboarding_id is not null;

drop trigger if exists employee_onboardings_touch_updated_at on public.employee_onboardings;
create trigger employee_onboardings_touch_updated_at before update on public.employee_onboardings for each row execute function public.touch_updated_at();
drop trigger if exists onboarding_documents_touch_updated_at on public.onboarding_documents;
create trigger onboarding_documents_touch_updated_at before update on public.onboarding_documents for each row execute function public.touch_updated_at();
drop trigger if exists onboarding_tasks_touch_updated_at on public.onboarding_tasks;
create trigger onboarding_tasks_touch_updated_at before update on public.onboarding_tasks for each row execute function public.touch_updated_at();

create or replace function public.create_employee_onboarding(
  candidate_name text,candidate_email text,candidate_phone text,target_department uuid,target_designation text,
  target_employment_type text,target_employee_status text,target_joining_date date,target_manager uuid,target_owner uuid,target_compensation text,target_notes text
) returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_owner is null then target_owner:=actor; end if;
  if candidate_name is null or length(btrim(candidate_name))<2 or candidate_email is null or target_department is null or length(btrim(coalesce(target_designation,'')))<2 or target_joining_date is null then raise exception 'Name, email, department, designation and expected joining date are required.'; end if;
  if target_employee_status not in ('active','intern','probation') then raise exception 'Choose an approved employee status.'; end if;
  if exists(select 1 from public.profiles where lower(email)=lower(btrim(candidate_email))) then raise exception 'An employee with this email already exists.'; end if;
  insert into public.employee_onboardings(full_name,personal_email,phone,department_id,designation,employment_type,employee_status,reporting_manager_id,expected_joining_date,onboarding_owner_id,compensation,notes,created_by)
  values(btrim(candidate_name),lower(btrim(candidate_email)),nullif(btrim(candidate_phone),''),target_department,btrim(target_designation),nullif(btrim(target_employment_type),''),target_employee_status,target_manager,target_joining_date,target_owner,nullif(btrim(target_compensation),''),nullif(btrim(target_notes),''),actor)
  returning * into item;
  insert into public.onboarding_documents(onboarding_id,title,is_required,created_by) values
    (item.id,'ID proof',true,actor),(item.id,'Address proof',true,actor),(item.id,'Educational / experience certificate',false,actor),(item.id,'Photograph',false,actor),(item.id,'Signed Offer Letter',false,actor);
  insert into public.onboarding_tasks(onboarding_id,title,is_required,assigned_to,created_by) values
    (item.id,'Create or confirm CRM account',true,target_owner,actor),(item.id,'Assign approved role and reporting manager',true,target_owner,actor),(item.id,'Department orientation completed',true,target_owner,actor),(item.id,'Attendance process explained',true,target_owner,actor),(item.id,'Policy acknowledgement completed',true,target_owner,actor),(item.id,'Salary settings configured',false,target_owner,actor);
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'onboarding_created',actor,jsonb_build_object('stage',item.stage));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'onboarding_created','employee_onboardings',item.id,jsonb_build_object('stage',item.stage,'department_id',item.department_id));
  return item;
exception when unique_violation then raise exception 'An active onboarding already exists for this email.' using errcode='23505';
end $$;

create or replace function public.update_employee_onboarding(target_onboarding uuid,target_department uuid,target_designation text,target_employment_type text,target_employee_status text,target_joining_date date,target_manager uuid,target_owner uuid,target_compensation text,target_notes text)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid()); before_row jsonb;
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if item.stage in ('joined','onboarding_in_progress','completed','cancelled') then raise exception 'Joined or closed onboarding cannot be edited.'; end if;
  if target_employee_status not in ('active','intern','probation') then raise exception 'Choose an approved employee status.'; end if;
  before_row:=jsonb_build_object('department_id',item.department_id,'designation',item.designation,'expected_joining_date',item.expected_joining_date,'owner_id',item.onboarding_owner_id);
  update public.employee_onboardings set department_id=target_department,designation=btrim(target_designation),employment_type=nullif(btrim(target_employment_type),''),employee_status=target_employee_status,expected_joining_date=target_joining_date,reporting_manager_id=target_manager,onboarding_owner_id=target_owner,compensation=nullif(btrim(target_compensation),''),notes=nullif(btrim(target_notes),'') where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employment_details_updated',actor,jsonb_build_object('before',before_row,'after',jsonb_build_object('department_id',item.department_id,'designation',item.designation,'expected_joining_date',item.expected_joining_date,'owner_id',item.onboarding_owner_id)));
  return item;
end $$;

create or replace function public.add_onboarding_document(target_onboarding uuid,document_title text,required_document boolean)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare item public.onboarding_documents%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.employee_onboardings where id=target_onboarding and stage not in ('completed','cancelled')) then raise exception 'Open onboarding not found.'; end if;
  insert into public.onboarding_documents(onboarding_id,title,is_required,created_by) values(target_onboarding,btrim(document_title),required_document,actor) returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(target_onboarding,'document_requested',actor,jsonb_build_object('document_id',item.id,'required',item.is_required,'title',item.title));
  return item;
end $$;

create or replace function public.submit_onboarding_document(target_document uuid,target_path text,target_file_name text,target_mime text,target_size bigint)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare item public.onboarding_documents%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.onboarding_documents where id=target_document for update;
  if item.id is null or item.status not in ('pending','rejected') then raise exception 'Document is not awaiting submission.'; end if;
  if target_path not like 'company/'||actor::text||'/onboarding/%' or target_size not between 1 and 10485760 then raise exception 'Invalid private document upload.'; end if;
  update public.onboarding_documents set status='submitted',storage_path=target_path,file_name=target_file_name,mime_type=target_mime,file_size=target_size,submitted_by=actor,submitted_at=now(),verified_by=null,verified_at=null,rejection_reason=null where id=item.id returning * into item;
  update public.employee_onboardings set stage='documents_submitted' where id=item.onboarding_id and stage='documents_pending' and not exists(select 1 from public.onboarding_documents d where d.onboarding_id=item.onboarding_id and d.is_required and d.status='pending');
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.onboarding_id,'document_submitted',actor,jsonb_build_object('document_id',item.id,'title',item.title));
  return item;
end $$;

create or replace function public.review_onboarding_document(target_document uuid,decision text,review_reason text default null)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare item public.onboarding_documents%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.onboarding_documents where id=target_document for update;
  if item.id is null or item.status<>'submitted' then raise exception 'Only submitted documents can be reviewed.'; end if;
  if decision not in ('verified','rejected') or (decision='rejected' and length(btrim(coalesce(review_reason,'')))<3) then raise exception 'Choose verified or provide a rejection reason.'; end if;
  update public.onboarding_documents set status=decision,verified_by=case when decision='verified' then actor else null end,verified_at=case when decision='verified' then now() else null end,rejection_reason=case when decision='rejected' then btrim(review_reason) else null end where id=item.id returning * into item;
  if decision='verified' and not exists(select 1 from public.onboarding_documents d where d.onboarding_id=item.onboarding_id and d.is_required and d.status<>'verified') then update public.employee_onboardings set stage='documents_verified' where id=item.onboarding_id and stage in ('documents_pending','documents_submitted'); end if;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.onboarding_id,'document_'||decision,actor,jsonb_build_object('document_id',item.id,'title',item.title,'reason',case when decision='rejected' then btrim(review_reason) else null end));
  return item;
end $$;

create or replace function public.record_onboarding_offer(target_onboarding uuid,target_document uuid)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.stage not in ('documents_verified','offer_generated','offer_sent') then raise exception 'Verify all required documents before generating the offer.'; end if;
  if not exists(select 1 from public.documents where id=target_document and onboarding_id=item.id and document_type='offer_letter') then raise exception 'Offer document does not belong to this onboarding.'; end if;
  update public.employee_onboardings set stage='offer_generated',offer_document_id=target_document,offer_generated_at=now(),offer_generated_by=actor where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'offer_generated',actor,jsonb_build_object('document_id',target_document));
  return item;
end $$;

create or replace function public.advance_employee_onboarding(target_onboarding uuid,target_action text,action_date date default null,action_reason text default null)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if target_action='offer_sent' then
    if item.stage<>'offer_generated' or item.offer_document_id is null then raise exception 'Generate an offer before marking it sent.'; end if;
    update public.employee_onboardings set stage='offer_sent',offer_status='sent',offer_sent_at=coalesce(action_date,current_date)::timestamptz,offer_sent_by=actor where id=item.id;
  elsif target_action='offer_accepted' then
    if item.stage not in ('offer_generated','offer_sent') or item.offer_document_id is null then raise exception 'A generated offer is required before acceptance.'; end if;
    update public.employee_onboardings set stage='offer_accepted',offer_status='accepted',offer_accepted_at=coalesce(action_date,current_date)::timestamptz where id=item.id;
  elsif target_action='offer_declined' then
    if item.stage not in ('offer_generated','offer_sent') then raise exception 'Only an outstanding offer can be declined.'; end if;
    update public.employee_onboardings set stage='cancelled',offer_status='declined',offer_declined_at=coalesce(action_date,current_date)::timestamptz,decline_reason=nullif(btrim(action_reason),''),cancellation_reason=coalesce(nullif(btrim(action_reason),''),'Offer declined'),cancelled_at=now(),cancelled_by=actor where id=item.id;
  elsif target_action='joining_confirmed' then
    if item.stage<>'offer_accepted' then raise exception 'Offer acceptance is required before joining.'; end if;
    if action_date is null then raise exception 'Actual joining date is required.'; end if;
    update public.employee_onboardings set stage='joined',actual_joining_date=action_date,joining_confirmed_at=now(),joining_confirmed_by=actor where id=item.id;
  elsif target_action='cancel' then
    if item.stage in ('completed','cancelled') or length(btrim(coalesce(action_reason,'')))<3 then raise exception 'Open onboarding and a cancellation reason are required.'; end if;
    update public.employee_onboardings set stage='cancelled',cancellation_reason=btrim(action_reason),cancelled_at=now(),cancelled_by=actor where id=item.id;
  else raise exception 'Unsupported onboarding action.';
  end if;
  select * into item from public.employee_onboardings where id=target_onboarding;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,target_action,actor,jsonb_build_object('date',action_date,'reason',nullif(btrim(action_reason),'')));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'onboarding_'||target_action,'employee_onboardings',item.id,jsonb_build_object('stage',item.stage));
  return item;
end $$;

create or replace function public.add_onboarding_task(target_onboarding uuid,task_title text,required_task boolean,task_owner uuid)
returns public.onboarding_tasks language plpgsql security definer set search_path='' as $$
declare item public.onboarding_tasks%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  insert into public.onboarding_tasks(onboarding_id,title,is_required,assigned_to,created_by) select target_onboarding,btrim(task_title),required_task,task_owner,actor from public.employee_onboardings where id=target_onboarding and stage not in ('completed','cancelled') returning * into item;
  if item.id is null then raise exception 'Open onboarding not found.'; end if;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(target_onboarding,'onboarding_task_added',actor,jsonb_build_object('task_id',item.id,'title',item.title,'required',item.is_required));
  return item;
end $$;

create or replace function public.set_onboarding_task_status(target_task uuid,target_status text)
returns public.onboarding_tasks language plpgsql security definer set search_path='' as $$
declare item public.onboarding_tasks%rowtype; actor uuid:=(select auth.uid()); stage_now text;
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_status not in ('pending','completed') then raise exception 'Invalid task status.'; end if;
  select onboarding.stage into stage_now from public.onboarding_tasks task join public.employee_onboardings onboarding on onboarding.id=task.onboarding_id where task.id=target_task;
  if stage_now not in ('joined','onboarding_in_progress') then raise exception 'Onboarding tasks can be completed only after joining.'; end if;
  update public.onboarding_tasks set status=target_status,completed_by=case when target_status='completed' then actor else null end,completed_at=case when target_status='completed' then now() else null end where id=target_task returning * into item;
  update public.employee_onboardings set stage='onboarding_in_progress' where id=item.onboarding_id and stage='joined';
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.onboarding_id,'onboarding_task_'||target_status,actor,jsonb_build_object('task_id',item.id,'title',item.title));
  return item;
end $$;

create or replace function public.activate_onboarding_employee(target_onboarding uuid,target_user uuid,target_role text)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid()); code text; next_number integer; protected boolean:=target_role in ('chairman','director','general_manager','super_admin');
begin
  if actor is null or not public.has_permission('onboarding.activate') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if item.employee_id is not null then return item; end if;
  if item.stage not in ('joined','onboarding_in_progress') or item.offer_status<>'accepted' or item.actual_joining_date is null then raise exception 'Joining must be confirmed before activation.'; end if;
  if exists(select 1 from public.onboarding_documents where onboarding_id=item.id and is_required and status<>'verified') then raise exception 'All required documents must be verified.'; end if;
  if exists(select 1 from public.onboarding_tasks where onboarding_id=item.id and is_required and status<>'completed') then raise exception 'All required onboarding tasks must be completed.'; end if;
  if target_role not in ('staff','intern','psychologist','guest_sales','chairman','director','general_manager') or (protected and not public.is_super_admin()) then raise exception 'Role assignment is not permitted.' using errcode='42501'; end if;
  if exists(select 1 from public.profiles where lower(email)=lower(item.personal_email) or (item.phone is not null and phone=item.phone)) then raise exception 'An employee with this email or phone already exists.'; end if;
  if not exists(select 1 from auth.users where id=target_user and lower(email)=lower(item.personal_email)) then raise exception 'The invited Auth user does not match this onboarding.'; end if;
  perform pg_advisory_xact_lock(hashtext('bsmile_employee_code'));
  select coalesce(max(substring(employee_code from 2)::integer),0)+1 into next_number from public.profiles where employee_code ~ '^A[0-9]+$';
  code:='A'||lpad(next_number::text,3,'0');
  insert into public.profiles(id,full_name,email,phone,employee_code,department_id,designation,role,manager_id,joining_date,employment_type,status,is_employee,workforce_visible,login_enabled)
  values(target_user,item.full_name,item.personal_email,item.phone,code,item.department_id,item.designation,target_role::public.app_role,item.reporting_manager_id,item.actual_joining_date,item.employment_type,item.employee_status,true,true,true);
  update public.employee_onboardings set employee_id=target_user,activation_state='completed',stage='completed' where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employee_activated',actor,jsonb_build_object('employee_id',target_user,'employee_code',code,'role',target_role));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'onboarding_employee_activated','employee_onboardings',item.id,jsonb_build_object('employee_id',target_user,'employee_code',code));
  return item;
end $$;

alter table public.employee_onboardings enable row level security;
alter table public.onboarding_documents enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.onboarding_events enable row level security;
create policy "onboarding authorized read" on public.employee_onboardings for select to authenticated using(public.has_permission('onboarding.view') or public.has_permission('onboarding.manage'));
create policy "onboarding documents authorized read" on public.onboarding_documents for select to authenticated using(public.has_permission('onboarding.view') or public.has_permission('onboarding.manage'));
create policy "onboarding tasks authorized read" on public.onboarding_tasks for select to authenticated using(public.has_permission('onboarding.view') or public.has_permission('onboarding.manage'));
create policy "onboarding events authorized read" on public.onboarding_events for select to authenticated using(public.has_permission('onboarding.view') or public.has_permission('onboarding.manage'));
create policy "onboarding official documents read" on public.documents for select to authenticated using(onboarding_id is not null and (public.has_permission('onboarding.view') or public.has_permission('onboarding.manage')));
create policy "onboarding official documents create" on public.documents for insert to authenticated with check(onboarding_id is not null and uploaded_by=(select auth.uid()) and public.has_permission('onboarding.manage'));

grant select on public.employee_onboardings,public.onboarding_documents,public.onboarding_tasks,public.onboarding_events to authenticated;
revoke insert,update,delete on public.employee_onboardings,public.onboarding_documents,public.onboarding_tasks,public.onboarding_events from authenticated;

create policy "onboarding private uploads" on storage.objects for insert to authenticated with check(
  bucket_id='employee-documents' and public.has_permission('onboarding.manage')
  and (storage.foldername(name))[1]='company' and (storage.foldername(name))[2]=(select auth.uid())::text and (storage.foldername(name))[3]='onboarding'
  and lower(coalesce(storage.extension(name),'')) in ('pdf','jpg','jpeg','png','webp')
  and lower(coalesce(metadata->>'mimetype','')) in ('application/pdf','image/jpeg','image/png','image/webp')
  and case when coalesce(metadata->>'size','') ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end between 1 and 10485760
);
create policy "onboarding private downloads" on storage.objects for select to authenticated using(
  bucket_id='employee-documents' and (public.has_permission('onboarding.view') or public.has_permission('onboarding.manage'))
  and (exists(select 1 from public.onboarding_documents d where d.storage_path=name) or exists(select 1 from public.documents d where d.storage_path=name and d.onboarding_id is not null))
);

create or replace function public.notify_onboarding_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; title_text text; body_text text;
begin
  if new.event_type not in ('document_submitted','offer_accepted','joining_confirmed') then return new; end if;
  select onboarding_owner_id into owner_id from public.employee_onboardings where id=new.onboarding_id;
  if owner_id is null or owner_id=new.actor_id then return new; end if;
  title_text:=case new.event_type when 'document_submitted' then 'Onboarding document submitted' when 'offer_accepted' then 'Offer accepted' else 'Employee joining confirmed' end;
  body_text:=case new.event_type when 'document_submitted' then 'An onboarding document is ready for review.' when 'offer_accepted' then 'An onboarding offer was accepted.' else 'An incoming employee joining date was confirmed.' end;
  insert into public.notifications(profile_id,title,body,type,related_entity_id,deep_link,sender_id) values(owner_id,title_text,body_text,'onboarding_'||new.event_type,new.onboarding_id,'/admin/onboarding/'||new.onboarding_id::text,new.actor_id);
  return new;
end $$;
drop trigger if exists onboarding_owner_notification on public.onboarding_events;
create trigger onboarding_owner_notification after insert on public.onboarding_events for each row execute function public.notify_onboarding_owner();

revoke execute on function public.create_employee_onboarding(text,text,text,uuid,text,text,text,date,uuid,uuid,text,text),public.update_employee_onboarding(uuid,uuid,text,text,text,date,uuid,uuid,text,text),public.add_onboarding_document(uuid,text,boolean),public.submit_onboarding_document(uuid,text,text,text,bigint),public.review_onboarding_document(uuid,text,text),public.record_onboarding_offer(uuid,uuid),public.advance_employee_onboarding(uuid,text,date,text),public.add_onboarding_task(uuid,text,boolean,uuid),public.set_onboarding_task_status(uuid,text),public.activate_onboarding_employee(uuid,uuid,text) from public,anon;
grant execute on function public.create_employee_onboarding(text,text,text,uuid,text,text,text,date,uuid,uuid,text,text),public.update_employee_onboarding(uuid,uuid,text,text,text,date,uuid,uuid,text,text),public.add_onboarding_document(uuid,text,boolean),public.submit_onboarding_document(uuid,text,text,text,bigint),public.review_onboarding_document(uuid,text,text),public.record_onboarding_offer(uuid,uuid),public.advance_employee_onboarding(uuid,text,date,text),public.add_onboarding_task(uuid,text,boolean,uuid),public.set_onboarding_task_status(uuid,text),public.activate_onboarding_employee(uuid,uuid,text) to authenticated,service_role;

notify pgrst,'reload schema';

-- Recovered from supabase/migrations/20260814080000_batch_5_onboarding_activation_safety.sql
-- Batch 5 audit follow-up: make offer acceptance and invitation retries safe.

alter table public.employee_onboardings
  add column if not exists invited_user_id uuid,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists invitation_sent_by uuid references public.profiles(id),
  add column if not exists activation_failure_reason text;

create or replace function public.begin_onboarding_activation(target_onboarding uuid)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.activate') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if item.employee_id is not null then return item; end if;
  if item.activation_state='in_progress' then raise exception 'Employee activation is already in progress.'; end if;
  if item.stage not in ('joined','onboarding_in_progress') or item.offer_status<>'accepted' or item.actual_joining_date is null then raise exception 'Joining must be confirmed before activation.'; end if;
  if exists(select 1 from public.onboarding_documents where onboarding_id=item.id and is_required and status<>'verified') then raise exception 'All required documents must be verified.'; end if;
  if exists(select 1 from public.onboarding_tasks where onboarding_id=item.id and is_required and status<>'completed') then raise exception 'All required onboarding tasks must be completed.'; end if;
  update public.employee_onboardings set activation_state='in_progress',activation_failure_reason=null where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employee_activation_started',actor,jsonb_build_object('reusing_invitation',item.invited_user_id is not null));
  return item;
end $$;

create or replace function public.record_onboarding_invitation(target_onboarding uuid,target_user uuid)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.activate') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null or item.employee_id is not null or item.activation_state<>'in_progress' then raise exception 'Onboarding is not awaiting an invitation.'; end if;
  if not exists(select 1 from auth.users where id=target_user and lower(email)=lower(item.personal_email)) then raise exception 'The invited Auth user does not match this onboarding.'; end if;
  if item.invited_user_id is not null and item.invited_user_id<>target_user then raise exception 'An invitation is already linked to this onboarding.'; end if;
  update public.employee_onboardings set invited_user_id=target_user,invitation_sent_at=coalesce(invitation_sent_at,now()),invitation_sent_by=coalesce(invitation_sent_by,actor) where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employee_invitation_sent',actor,jsonb_build_object('invited_user_id',target_user));
  return item;
end $$;

create or replace function public.mark_onboarding_activation_failed(target_onboarding uuid,failure_reason text)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid := (select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.activate') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if item.employee_id is not null then return item; end if;
  update public.employee_onboardings set activation_state='failed',activation_failure_reason=left(nullif(btrim(failure_reason),''),500) where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employee_activation_failed',actor,jsonb_build_object('has_invitation',item.invited_user_id is not null));
  return item;
end $$;

create or replace function public.activate_onboarding_employee(target_onboarding uuid,target_user uuid,target_role text)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid()); code text; next_number integer; protected boolean:=target_role in ('chairman','director','general_manager','super_admin');
begin
  if actor is null or not public.has_permission('onboarding.activate') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if item.employee_id is not null then return item; end if;
  if item.activation_state<>'in_progress' then raise exception 'Start employee activation before creating the profile.'; end if;
  if item.stage not in ('joined','onboarding_in_progress') or item.offer_status<>'accepted' or item.actual_joining_date is null then raise exception 'Joining must be confirmed before activation.'; end if;
  if exists(select 1 from public.onboarding_documents where onboarding_id=item.id and is_required and status<>'verified') then raise exception 'All required documents must be verified.'; end if;
  if exists(select 1 from public.onboarding_tasks where onboarding_id=item.id and is_required and status<>'completed') then raise exception 'All required onboarding tasks must be completed.'; end if;
  if target_role not in ('staff','intern','psychologist','guest_sales','chairman','director','general_manager') or (protected and not public.is_super_admin()) then raise exception 'Role assignment is not permitted.' using errcode='42501'; end if;
  if item.invited_user_id is null or item.invited_user_id<>target_user then raise exception 'Use the invitation linked to this onboarding.'; end if;
  if exists(select 1 from public.profiles where lower(email)=lower(item.personal_email) or (item.phone is not null and phone=item.phone)) then raise exception 'An employee with this email or phone already exists.'; end if;
  if not exists(select 1 from auth.users where id=target_user and lower(email)=lower(item.personal_email)) then raise exception 'The invited Auth user does not match this onboarding.'; end if;
  perform pg_advisory_xact_lock(hashtext('bsmile_employee_code'));
  select coalesce(max(substring(employee_code from 2)::integer),0)+1 into next_number from public.profiles where employee_code ~ '^A[0-9]+$';
  code:='A'||lpad(next_number::text,3,'0');
  insert into public.profiles(id,full_name,email,phone,employee_code,department_id,designation,role,manager_id,joining_date,employment_type,status,is_employee,workforce_visible,login_enabled)
  values(target_user,item.full_name,item.personal_email,item.phone,code,item.department_id,item.designation,target_role::public.app_role,item.reporting_manager_id,item.actual_joining_date,item.employment_type,item.employee_status,true,true,true);
  update public.employee_onboardings set employee_id=target_user,activation_state='completed',activation_failure_reason=null,stage='completed' where id=item.id returning * into item;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,'employee_activated',actor,jsonb_build_object('employee_id',target_user,'employee_code',code,'role',target_role));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'onboarding_employee_activated','employee_onboardings',item.id,jsonb_build_object('employee_id',target_user,'employee_code',code));
  return item;
end $$;

create or replace function public.advance_employee_onboarding(target_onboarding uuid,target_action text,action_date date default null,action_reason text default null)
returns public.employee_onboardings language plpgsql security definer set search_path='' as $$
declare item public.employee_onboardings%rowtype; actor uuid:=(select auth.uid());
begin
  if actor is null or not public.has_permission('onboarding.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into item from public.employee_onboardings where id=target_onboarding for update;
  if item.id is null then raise exception 'Onboarding not found.'; end if;
  if target_action='offer_sent' then
    if item.stage<>'offer_generated' or item.offer_document_id is null then raise exception 'Generate an offer before marking it sent.'; end if;
    update public.employee_onboardings set stage='offer_sent',offer_status='sent',offer_sent_at=coalesce(action_date,current_date)::timestamptz,offer_sent_by=actor where id=item.id;
  elsif target_action='offer_accepted' then
    if item.stage<>'offer_sent' or item.offer_document_id is null then raise exception 'Mark the generated offer sent before acceptance.'; end if;
    update public.employee_onboardings set stage='offer_accepted',offer_status='accepted',offer_accepted_at=coalesce(action_date,current_date)::timestamptz where id=item.id;
  elsif target_action='offer_declined' then
    if item.stage not in ('offer_generated','offer_sent') then raise exception 'Only an outstanding offer can be declined.'; end if;
    update public.employee_onboardings set stage='cancelled',offer_status='declined',offer_declined_at=coalesce(action_date,current_date)::timestamptz,decline_reason=nullif(btrim(action_reason),''),cancellation_reason=coalesce(nullif(btrim(action_reason),''),'Offer declined'),cancelled_at=now(),cancelled_by=actor where id=item.id;
  elsif target_action='joining_confirmed' then
    if item.stage<>'offer_accepted' then raise exception 'Offer acceptance is required before joining.'; end if;
    if action_date is null then raise exception 'Actual joining date is required.'; end if;
    update public.employee_onboardings set stage='joined',actual_joining_date=action_date,joining_confirmed_at=now(),joining_confirmed_by=actor where id=item.id;
  elsif target_action='cancel' then
    if item.stage in ('completed','cancelled') or length(btrim(coalesce(action_reason,'')))<3 then raise exception 'Open onboarding and a cancellation reason are required.'; end if;
    update public.employee_onboardings set stage='cancelled',cancellation_reason=btrim(action_reason),cancelled_at=now(),cancelled_by=actor where id=item.id;
  else raise exception 'Unsupported onboarding action.';
  end if;
  select * into item from public.employee_onboardings where id=target_onboarding;
  insert into public.onboarding_events(onboarding_id,event_type,actor_id,details) values(item.id,target_action,actor,jsonb_build_object('date',action_date,'reason',nullif(btrim(action_reason),'')));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'onboarding_'||target_action,'employee_onboardings',item.id,jsonb_build_object('stage',item.stage));
  return item;
end $$;

revoke all on function public.begin_onboarding_activation(uuid),public.record_onboarding_invitation(uuid,uuid),public.mark_onboarding_activation_failed(uuid,text),public.activate_onboarding_employee(uuid,uuid,text),public.advance_employee_onboarding(uuid,text,date,text) from public,anon;
grant execute on function public.begin_onboarding_activation(uuid),public.record_onboarding_invitation(uuid,uuid),public.mark_onboarding_activation_failed(uuid,text),public.activate_onboarding_employee(uuid,uuid,text),public.advance_employee_onboarding(uuid,text,date,text) to authenticated,service_role;

revoke execute on function public.notify_onboarding_owner() from public,anon,authenticated;
revoke execute on function public.begin_onboarding_activation(uuid),public.record_onboarding_invitation(uuid,uuid),public.mark_onboarding_activation_failed(uuid,text) from public,anon;

notify pgrst,'reload schema';
