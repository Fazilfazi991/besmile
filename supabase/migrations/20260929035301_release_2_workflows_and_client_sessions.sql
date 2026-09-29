-- BSMILE Release 2 forward upgrade: employee onboarding, Genie workflows,
-- client sessions, payment idempotency, and reversible client archival.
-- Additive only. No production data cleanup or broad historical matching is performed.

-- ---------------------------------------------------------------------------
-- Employee login identity and mandatory first-login onboarding
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists onboarding_required boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists employee_provision_request_id text;

do $$
begin
  if exists(
    select 1 from public.profiles where email is not null
    group by lower(email) having count(*) > 1
  ) then
    raise exception 'Cannot enforce unique login emails while case-insensitive duplicates exist.' using errcode='23505';
  end if;
end;
$$;
create unique index if not exists profiles_login_email_unique
  on public.profiles(lower(email)) where email is not null;
create unique index if not exists profiles_employee_provision_request_unique
  on public.profiles(employee_provision_request_id) where employee_provision_request_id is not null;

create or replace function public.enforce_profile_onboarding_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.onboarding_required is distinct from old.onboarding_required
    or new.onboarding_completed_at is distinct from old.onboarding_completed_at
    or new.employee_provision_request_id is distinct from old.employee_provision_request_id
  ) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Employee onboarding state is service-managed.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_profile_onboarding_state() from public, anon, authenticated, service_role;
drop trigger if exists profiles_onboarding_state_guard on public.profiles;
create trigger profiles_onboarding_state_guard
before update of onboarding_required, onboarding_completed_at, employee_provision_request_id on public.profiles
for each row execute function public.enforce_profile_onboarding_state();

create or replace function public.has_permission(permission_code text, subject_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles subject
    left join public.departments department on department.id = subject.department_id
    where subject.id = subject_id
      and subject.status = 'active'
      and not coalesce(subject.onboarding_required, false)
      and (
        subject.role = 'super_admin'
        or (
          (
            permission_code <> all(array[
              'employees.view','employees.manage','employees.create','employees.edit',
              'employees.status.manage','employees.remove','employees.delete'
            ])
            or subject.role::text in ('chairman', 'director', 'general_manager')
          )
          and (
            public.role_has_permission(subject.role, permission_code)
            or exists (
              select 1
              from public.user_permission_grants grant_row
              join public.permissions permission on permission.id = grant_row.permission_id
              where grant_row.profile_id = subject.id
                and permission.code = permission_code
                and grant_row.revoked_at is null
                and grant_row.starts_at <= now()
                and (grant_row.expires_at is null or grant_row.expires_at > now())
            )
            or exists (
              select 1
              from public.designation_permission_bundles bundle
              join public.designation_permission_bundle_permissions bundle_permission on bundle_permission.bundle_id = bundle.id
              join public.permissions permission on permission.id = bundle_permission.permission_id
              where bundle.is_active
                and permission.code = permission_code
                and lower(bundle.department_name) = lower(coalesce(department.name, ''))
                and lower(bundle.designation) = lower(coalesce(subject.designation, ''))
            )
          )
        )
      )
  )
$$;

revoke all on function public.has_permission(text, uuid) from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;

create or replace function public.complete_employee_onboarding(target_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  update public.profiles
  set onboarding_required = false,
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = target_profile and onboarding_required;
end
$$;
revoke all on function public.complete_employee_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.complete_employee_onboarding(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Durable, user-bound Genie action drafts and confirmation idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.genie_workflow_drafts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null,
  action_type text not null check (action_type in ('lead','task','expense')),
  draft jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  version integer not null default 1 check (version > 0),
  confirmation_token uuid,
  idempotency_key uuid not null default gen_random_uuid(),
  identity_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','awaiting_confirmation','completed','cancelled')),
  result_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists genie_one_active_draft_per_conversation
  on public.genie_workflow_drafts(actor_id, conversation_id)
  where status in ('draft','awaiting_confirmation');
create index if not exists genie_drafts_actor_updated_idx
  on public.genie_workflow_drafts(actor_id, updated_at desc);

create table if not exists public.genie_action_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null check (action_type in ('lead','task','expense')),
  idempotency_key uuid not null,
  draft_id uuid not null references public.genie_workflow_drafts(id) on delete restrict,
  request_payload jsonb not null default '{}'::jsonb,
  result_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(actor_id, action_type, idempotency_key)
);
alter table public.genie_action_requests
  add column if not exists request_payload jsonb not null default '{}'::jsonb;

alter table public.genie_workflow_drafts enable row level security;
alter table public.genie_action_requests enable row level security;
drop policy if exists "genie actors own drafts" on public.genie_workflow_drafts;
drop policy if exists "genie actors read drafts" on public.genie_workflow_drafts;
create policy "genie actors read drafts" on public.genie_workflow_drafts
  for select to authenticated using (actor_id = auth.uid());
drop policy if exists "genie actors read requests" on public.genie_action_requests;
create policy "genie actors read requests" on public.genie_action_requests
  for select to authenticated using (actor_id = auth.uid());
revoke insert, update, delete on public.genie_workflow_drafts from authenticated;
grant select on public.genie_workflow_drafts to authenticated;
grant select on public.genie_action_requests to authenticated;

create or replace function public.start_genie_workflow_draft(
  target_conversation uuid,
  target_action_type text,
  draft_payload jsonb,
  draft_missing_fields text[],
  target_confirmation_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if target_action_type not in ('lead','task','expense') then raise exception 'Unsupported Genie action.' using errcode='22023'; end if;
  insert into public.genie_workflow_drafts(actor_id,conversation_id,action_type,draft,missing_fields,confirmation_token,status,identity_snapshot)
  values(
    auth.uid(),target_conversation,target_action_type,coalesce(draft_payload,'{}'::jsonb),coalesce(draft_missing_fields,'{}'::text[]),
    case when cardinality(coalesce(draft_missing_fields,'{}'::text[]))=0 then target_confirmation_token else null end,
    case when cardinality(coalesce(draft_missing_fields,'{}'::text[]))=0 then 'awaiting_confirmation' else 'draft' end,
    jsonb_build_object('actor_id',auth.uid(),'role',public.current_role()::text)
  ) returning id into created_id;
  return created_id;
end
$$;
revoke all on function public.start_genie_workflow_draft(uuid,text,jsonb,text[],uuid) from public,anon;
grant execute on function public.start_genie_workflow_draft(uuid,text,jsonb,text[],uuid) to authenticated;

create or replace function public.update_genie_workflow_draft(
  target_draft uuid,
  expected_version integer,
  draft_payload jsonb,
  draft_missing_fields text[],
  target_confirmation_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_draft public.genie_workflow_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into current_draft from public.genie_workflow_drafts
    where id=target_draft and actor_id=auth.uid() and status in ('draft','awaiting_confirmation') for update;
  if current_draft.id is null then raise exception 'Workflow draft not found.' using errcode='P0002'; end if;
  if current_draft.version<>expected_version then raise exception 'This draft changed. Review it again.' using errcode='40001'; end if;
  update public.genie_workflow_drafts
  set draft=coalesce(draft_payload,'{}'::jsonb),missing_fields=coalesce(draft_missing_fields,'{}'::text[]),version=version+1,
      confirmation_token=case when cardinality(coalesce(draft_missing_fields,'{}'::text[]))=0 then target_confirmation_token else null end,
      status=case when cardinality(coalesce(draft_missing_fields,'{}'::text[]))=0 then 'awaiting_confirmation' else 'draft' end,
      updated_at=now()
  where id=current_draft.id;
end
$$;
revoke all on function public.update_genie_workflow_draft(uuid,integer,jsonb,text[],uuid) from public,anon;
grant execute on function public.update_genie_workflow_draft(uuid,integer,jsonb,text[],uuid) to authenticated;

create or replace function public.cancel_genie_workflow_draft(target_draft uuid, expected_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.genie_workflow_drafts set status='cancelled',confirmation_token=null,updated_at=now()
  where id=target_draft and actor_id=auth.uid() and version=expected_version and status in ('draft','awaiting_confirmation');
  if not found then raise exception 'Workflow draft not found or changed.' using errcode='40001'; end if;
end
$$;
revoke all on function public.cancel_genie_workflow_draft(uuid,integer) from public,anon;
grant execute on function public.cancel_genie_workflow_draft(uuid,integer) to authenticated;

create or replace function public.confirm_genie_action(
  target_draft uuid,
  expected_version integer,
  expected_confirmation_token uuid,
  request_key uuid
)
returns table(action_type text, result_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow public.genie_workflow_drafts%rowtype;
  prior public.genie_action_requests%rowtype;
  created_id uuid;
  assignment_id uuid;
  expense_category_name text;
  expense_subtype text;
  replay_payload jsonb;
  normalized_phone text;
  claimed_request uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into workflow from public.genie_workflow_drafts
    where id=target_draft and actor_id=auth.uid() for update;
  if workflow.id is null then raise exception 'Workflow draft not found.' using errcode='P0002'; end if;

  if (workflow.identity_snapshot->>'actor_id')::uuid is distinct from auth.uid() then
    raise exception 'Your identity changed. Restart this workflow.' using errcode='42501';
  end if;
  if coalesce(workflow.identity_snapshot->>'role','') is distinct from coalesce(public.current_role()::text,'') then
    raise exception 'Your access scope changed. Restart this workflow.' using errcode='42501';
  end if;
  if workflow.action_type='lead' and not public.has_permission('leads.create') then
    raise exception 'Permission denied for lead creation.' using errcode='42501';
  elsif workflow.action_type='task' and not public.has_permission('tasks.assign') then
    raise exception 'Permission denied for task creation.' using errcode='42501';
  elsif workflow.action_type='expense' and not (public.has_permission('expenses.manage') or public.has_permission('finance.manage')) then
    raise exception 'Permission denied for expense creation.' using errcode='42501';
  end if;

  select * into prior from public.genie_action_requests request_row
    where request_row.actor_id=auth.uid() and request_row.action_type=workflow.action_type and request_row.idempotency_key=request_key;
  if prior.id is not null and prior.result_id is not null then
    replay_payload:=jsonb_build_object('draft_id',workflow.id,'version',expected_version,'confirmation_token',expected_confirmation_token,'draft',workflow.draft);
    if prior.request_payload is distinct from replay_payload then
      raise exception 'This operation key was already used for a different Genie payload.' using errcode='22023';
    end if;
    return query select workflow.action_type, prior.result_id, true;
    return;
  end if;

  if workflow.status <> 'awaiting_confirmation'
    or workflow.version <> expected_version
    or workflow.confirmation_token is distinct from expected_confirmation_token
    or workflow.idempotency_key <> request_key
    or cardinality(workflow.missing_fields) <> 0
  then
    raise exception 'This confirmation is stale. Review the current draft before saving.' using errcode='40001';
  end if;
  replay_payload:=jsonb_build_object('draft_id',workflow.id,'version',expected_version,'confirmation_token',expected_confirmation_token,'draft',workflow.draft);
  insert into public.genie_action_requests(actor_id,action_type,idempotency_key,draft_id,request_payload)
  values(auth.uid(),workflow.action_type,request_key,workflow.id,replay_payload)
  on conflict on constraint genie_action_requests_actor_id_action_type_idempotency_key_key do nothing
  returning id into claimed_request;
  if claimed_request is null then
    select * into prior from public.genie_action_requests request_row
      where request_row.actor_id=auth.uid() and request_row.action_type=workflow.action_type and request_row.idempotency_key=request_key;
    if prior.request_payload is distinct from replay_payload then
      raise exception 'This operation key was already used for a different Genie payload.' using errcode='22023';
    end if;
    if prior.result_id is not null then
      return query select workflow.action_type,prior.result_id,true;
      return;
    end if;
    raise exception 'This Genie confirmation is already in progress.' using errcode='40001';
  end if;

  if workflow.action_type='lead' then
    if nullif(btrim(workflow.draft->>'full_name'),'') is null or nullif(btrim(workflow.draft->>'phone'),'') is null or nullif(workflow.draft->>'lead_date','') is null then
      raise exception 'Lead name, phone, and date are required.' using errcode='22023';
    end if;
    assignment_id := coalesce((workflow.draft->>'assigned_to')::uuid,auth.uid());
    if assignment_id <> auth.uid() and not (public.has_permission('leads.assign') or public.has_permission('crm.manage_all')) then
      raise exception 'Permission denied for assigning this lead.' using errcode='42501';
    end if;
    if assignment_id <> auth.uid() and not exists(
      select 1 from public.profiles profile where profile.id=assignment_id and profile.status='active'
        and ((profile.is_employee and profile.workforce_visible) or profile.role::text in ('chairman','director'))
    ) then raise exception 'Choose an active authorized lead assignee.'; end if;
    if not exists(select 1 from public.crm_lead_sources where id=(workflow.draft->>'source_id')::uuid and is_active) then raise exception 'Choose an active lead source.'; end if;
    if not exists(select 1 from public.crm_lead_statuses where id=(workflow.draft->>'status_id')::uuid and is_active) then raise exception 'Choose an active lead status.'; end if;
    normalized_phone:=regexp_replace(workflow.draft->>'phone','[^0-9]','','g');
    if length(normalized_phone) not between 7 and 15 then raise exception 'Enter a valid phone number with 7 to 15 digits.' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('genie-lead-phone:'||normalized_phone,0));
    if exists(
      select 1 from public.crm_leads lead
      where lead.archived_at is null and regexp_replace(lead.phone,'[^0-9]','','g')=normalized_phone
    ) then raise exception 'A lead with this phone number already exists.' using errcode='23505'; end if;
    insert into public.crm_leads(lead_date,full_name,phone,gender,profession,reason_for_enquiry,location,source_id,status_id,temperature,remarks,assigned_to,created_by)
    values(
      (workflow.draft->>'lead_date')::date,btrim(workflow.draft->>'full_name'),normalized_phone,nullif(workflow.draft->>'gender',''),
      nullif(workflow.draft->>'profession',''),nullif(workflow.draft->>'reason_for_enquiry',''),nullif(workflow.draft->>'location',''),
      (workflow.draft->>'source_id')::uuid,(workflow.draft->>'status_id')::uuid,coalesce(nullif(workflow.draft->>'temperature',''),'cold'),
      nullif(workflow.draft->>'remarks',''),assignment_id,auth.uid()
    ) returning id into created_id;
  elsif workflow.action_type='task' then
    if nullif(btrim(workflow.draft->>'title'),'') is null or nullif(workflow.draft->>'due_date','') is null
      or jsonb_typeof(workflow.draft->'assignee_ids') is distinct from 'array'
      or jsonb_array_length(workflow.draft->'assignee_ids')=0
      or coalesce(workflow.draft->>'priority','') not in ('low','medium','high')
    then raise exception 'Task title, due date, priority, and at least one assignee are required.' using errcode='22023'; end if;
    insert into public.tasks(title,description,priority,due_date,created_by,assignee_id,status)
    values(
      btrim(workflow.draft->>'title'),nullif(workflow.draft->>'description',''),coalesce(nullif(workflow.draft->>'priority',''),'medium'),
      (workflow.draft->>'due_date')::date,auth.uid(),(workflow.draft->'assignee_ids'->>0)::uuid,'todo'
    ) returning id into created_id;
    if exists(
      select 1 from jsonb_array_elements_text(workflow.draft->'assignee_ids') value
      left join public.profiles profile on profile.id=value::uuid
      where profile.id is null or profile.status<>'active' or not public.can_manage_task_assignment(created_id,value::uuid)
    ) then
      raise exception 'Permission denied for one or more task assignees.' using errcode='42501';
    end if;
    insert into public.task_assignments(task_id,profile_id,status)
      select created_id,value::uuid,'todo' from jsonb_array_elements_text(workflow.draft->'assignee_ids') value;
  else
    if coalesce((workflow.draft->>'amount')::numeric,0)<=0 or nullif(workflow.draft->>'transaction_date','') is null
      or coalesce(workflow.draft->>'payment_method','') not in ('cash','bank_transfer','upi','card')
    then raise exception 'Expense amount, date, and an approved payment method are required.' using errcode='22023'; end if;
    if not exists(select 1 from public.finance_accounts where id=(workflow.draft->>'account_id')::uuid and is_active) then raise exception 'Choose an active account.'; end if;
    select name into expense_category_name from public.finance_expense_categories where id=(workflow.draft->>'expense_category_id')::uuid and is_active;
    if expense_category_name is null then raise exception 'Choose an active expense category.'; end if;
    expense_subtype:=nullif(workflow.draft->>'expense_subcategory','');
    if expense_category_name='Marketing' and (expense_subtype is null or expense_subtype not in ('Digital Marketing Expenses','Performance Marketing Expenses','Other Marketing Expenses')) then
      raise exception 'Choose an approved Marketing expense type.' using errcode='22023';
    end if;
    if expense_subtype='Other Marketing Expenses' and nullif(btrim(workflow.draft->>'description'),'') is null then
      raise exception 'A comment is required for Other Marketing Expenses.' using errcode='22023';
    end if;
    if expense_category_name<>'Marketing' then expense_subtype:=null; end if;
    insert into public.finance_transactions(transaction_type,account_id,expense_category_id,expense_subcategory,amount,transaction_date,payment_method,reference_number,counterparty_name,description,created_by)
    values(
      'expense',(workflow.draft->>'account_id')::uuid,(workflow.draft->>'expense_category_id')::uuid,expense_subtype,(workflow.draft->>'amount')::numeric,
      (workflow.draft->>'transaction_date')::date,workflow.draft->>'payment_method',nullif(workflow.draft->>'reference_number',''),
      nullif(workflow.draft->>'counterparty',''),nullif(workflow.draft->>'description',''),auth.uid()
    ) returning id into created_id;
  end if;

  update public.genie_action_requests request_row set result_id=created_id,completed_at=now()
    where request_row.actor_id=auth.uid() and request_row.action_type=workflow.action_type and request_row.idempotency_key=request_key;
  update public.genie_workflow_drafts set status='completed',result_id=created_id,confirmation_token=null,updated_at=now()
    where id=workflow.id;
  return query select workflow.action_type,created_id,false;
end
$$;
revoke all on function public.confirm_genie_action(uuid,integer,uuid,uuid) from public,anon;
grant execute on function public.confirm_genie_action(uuid,integer,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Canonical repeat sessions, payments, and duplicate protection
-- ---------------------------------------------------------------------------
alter table public.patient_sessions
  add column if not exists session_fee numeric(14,2) check(session_fee is null or session_fee >= 0),
  add column if not exists invoice_id uuid references public.finance_invoices(id) on delete restrict,
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_payload jsonb,
  add column if not exists currency text not null default 'INR';
create unique index if not exists patient_sessions_creator_request_unique
  on public.patient_sessions(created_by,idempotency_key) where idempotency_key is not null;
create unique index if not exists patient_sessions_invoice_unique
  on public.patient_sessions(invoice_id) where invoice_id is not null;

alter table public.finance_invoices
  add column if not exists patient_session_id uuid references public.patient_sessions(id) on delete restrict,
  add column if not exists appointment_id uuid references public.doctor_appointments(id) on delete restrict;
create unique index if not exists finance_invoices_patient_session_unique
  on public.finance_invoices(patient_session_id) where patient_session_id is not null;
create unique index if not exists finance_invoices_appointment_unique
  on public.finance_invoices(appointment_id) where appointment_id is not null;

alter table public.finance_invoice_payments
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_payload jsonb;
create unique index if not exists finance_invoice_payment_request_unique
  on public.finance_invoice_payments(invoice_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists finance_invoice_payment_actor_request_unique
  on public.finance_invoice_payments(received_by,idempotency_key) where received_by is not null and idempotency_key is not null;
revoke insert, update, delete on public.finance_invoice_payments from authenticated;

create or replace function public.guard_patient_session_finance_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(pg_catalog.current_setting('bsmile.session_finance_rpc',true),'')='on' then return new; end if;
  if tg_op='INSERT' then
    if new.session_fee is not null or new.invoice_id is not null or new.idempotency_key is not null or new.idempotency_payload is not null then
      raise exception 'Session finance fields must be created through the atomic session workflow.' using errcode='42501';
    end if;
  elsif new.session_fee is distinct from old.session_fee
    or new.invoice_id is distinct from old.invoice_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.idempotency_payload is distinct from old.idempotency_payload then
    raise exception 'Session finance fields must be changed through an approved workflow.' using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function public.guard_patient_session_finance_fields() from public,anon,authenticated,service_role;
drop trigger if exists patient_session_finance_fields_guard on public.patient_sessions;
create trigger patient_session_finance_fields_guard before insert or update of session_fee,invoice_id,idempotency_key,idempotency_payload
on public.patient_sessions for each row execute function public.guard_patient_session_finance_fields();

create or replace function public.guard_finance_invoice_session_link()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(pg_catalog.current_setting('bsmile.session_finance_rpc',true),'')='on' then return new; end if;
  if new.patient_session_id is not null and (tg_op='INSERT' or new.patient_session_id is distinct from old.patient_session_id) then
    raise exception 'Session invoices must be linked through the atomic session workflow.' using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function public.guard_finance_invoice_session_link() from public,anon,authenticated,service_role;
drop trigger if exists finance_invoice_session_link_guard on public.finance_invoices;
create trigger finance_invoice_session_link_guard before insert or update of patient_session_id
on public.finance_invoices for each row execute function public.guard_finance_invoice_session_link();

create or replace function public.validate_session_invoice_link()
returns trigger language plpgsql set search_path='' as $$
declare row_data jsonb:=to_jsonb(new);
begin
  if tg_table_name='patient_sessions' and nullif(row_data->>'invoice_id','') is not null and not exists(
    select 1 from public.finance_invoices invoice where invoice.id=(row_data->>'invoice_id')::uuid and invoice.patient_session_id=(row_data->>'id')::uuid
  ) then raise exception 'Session and invoice links must be reciprocal.' using errcode='23514'; end if;
  if tg_table_name='finance_invoices' and nullif(row_data->>'patient_session_id','') is not null and not exists(
    select 1 from public.patient_sessions session where session.id=(row_data->>'patient_session_id')::uuid and session.invoice_id=(row_data->>'id')::uuid
  ) then raise exception 'Invoice and session links must be reciprocal.' using errcode='23514'; end if;
  return new;
end
$$;
revoke all on function public.validate_session_invoice_link() from public,anon,authenticated,service_role;
drop trigger if exists patient_session_invoice_link_check on public.patient_sessions;
create constraint trigger patient_session_invoice_link_check after insert or update on public.patient_sessions
deferrable initially deferred for each row execute function public.validate_session_invoice_link();
drop trigger if exists finance_invoice_session_link_check on public.finance_invoices;
create constraint trigger finance_invoice_session_link_check after insert or update on public.finance_invoices
deferrable initially deferred for each row execute function public.validate_session_invoice_link();

create or replace function public.create_patient_session_with_payment(
  target_patient uuid,
  session_at timestamptz,
  target_practitioner uuid,
  target_session_type text,
  target_duration integer,
  target_status text,
  target_session_number integer default null,
  target_follow_up date default null,
  target_summary text default null,
  target_fee numeric default 0,
  received_amount numeric default 0,
  receiving_account uuid default null,
  received_method text default null,
  received_reference text default null,
  request_key uuid default gen_random_uuid()
)
returns public.patient_sessions
language plpgsql
security definer
set search_path=''
as $$
declare
  session_row public.patient_sessions%rowtype;
  invoice_row public.finance_invoices%rowtype;
  patient_row public.patients%rowtype;
  total_paid numeric:=coalesce(received_amount,0);
  request_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if request_key is null then raise exception 'A session operation key is required.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':session:'||request_key::text,0));
  request_payload:=jsonb_build_object(
    'patient_id',target_patient,'session_at',session_at,'practitioner_id',target_practitioner,'session_type',target_session_type,
    'duration',target_duration,'status',target_status,'session_number',target_session_number,'follow_up',target_follow_up,
    'summary',nullif(btrim(target_summary),''),'fee',target_fee,'received',received_amount,'account_id',receiving_account,
    'method',received_method,'reference',nullif(btrim(received_reference),'')
  );
  if not public.has_permission('patient_sessions.create') or not public.patient_care_access(target_patient) then raise exception 'Permission denied for session creation.' using errcode='42501'; end if;
  select * into patient_row from public.patients where id=target_patient and deleted_at is null and archived_at is null;
  if patient_row.id is null then raise exception 'Active client not found.' using errcode='P0002'; end if;
  if target_fee>0 and not (public.has_permission('invoices.manage') or public.has_permission('finance.manage')) then raise exception 'Finance permission is required to create a paid session.' using errcode='42501'; end if;
  select * into session_row from public.patient_sessions where created_by=auth.uid() and idempotency_key=request_key;
  if session_row.id is not null then
    if session_row.idempotency_payload is distinct from request_payload then raise exception 'This operation key was already used for a different session payload.' using errcode='22023'; end if;
    return session_row;
  end if;
  if target_fee is null or target_fee<0 or target_fee>999999999999.99 or scale(target_fee)>2 or total_paid<0 or total_paid>target_fee or scale(total_paid)>2 then raise exception 'Payment must be between zero and the valid session fee.' using errcode='22023'; end if;
  if target_status not in ('scheduled','completed','cancelled','no_show','rescheduled') then raise exception 'Choose a valid session status.'; end if;
  if target_duration is null or target_duration<=0 then raise exception 'Duration must be greater than zero.'; end if;
  if target_practitioner is not null and not exists(
    select 1 from public.profiles profile
    join public.outsourced_doctors clinician on clinician.profile_id=profile.id
    where profile.id=target_practitioner and profile.status='active'
      and clinician.status='active' and clinician.archived_at is null
      and clinician.clinician_type in ('staff_psychologist','psychology_intern')
  ) then raise exception 'Choose an active staff practitioner.'; end if;
  if total_paid>0 and coalesce(received_method,'') not in ('cash','bank_transfer','upi','card') then raise exception 'Choose an approved payment method.' using errcode='22023'; end if;
  if total_paid>0 and not exists(select 1 from public.finance_accounts where id=receiving_account and is_active) then raise exception 'Choose an active receiving account.' using errcode='22023'; end if;

  perform pg_catalog.set_config('bsmile.session_finance_rpc','on',true);
  insert into public.patient_sessions(patient_id,appointment_at,assigned_psychologist_id,session_type,session_number,duration_minutes,attendance_status,follow_up_at,administrative_summary,session_fee,idempotency_key,idempotency_payload,created_by)
  values(target_patient,session_at,target_practitioner,target_session_type,target_session_number,target_duration,target_status,target_follow_up,nullif(btrim(target_summary),''),target_fee,request_key,request_payload,auth.uid())
  returning * into session_row;

  if target_fee>0 then
    insert into public.finance_invoices(invoice_number,patient_id,patient_session_id,customer_name,customer_phone,issue_date,due_date,status,currency,created_by)
    values('SESSION-'||replace(session_row.id::text,'-',''),target_patient,session_row.id,patient_row.full_name,patient_row.phone,(session_at at time zone public.business_timezone())::date,(session_at at time zone public.business_timezone())::date,
      case when total_paid=target_fee then 'paid' when total_paid>0 then 'partially_paid' else 'sent' end,'INR',auth.uid())
    returning * into invoice_row;
    insert into public.finance_invoice_items(invoice_id,description,quantity,rate) values(invoice_row.id,target_session_type,1,target_fee);
    if total_paid>0 then
      if receiving_account is null or received_method is null then raise exception 'Receiving account and payment method are required.'; end if;
      if not exists(select 1 from public.finance_accounts where id=receiving_account and is_active) then raise exception 'Choose an active receiving account.'; end if;
      insert into public.finance_invoice_payments(invoice_id,account_id,amount,payment_date,payment_method,reference_number,received_by,idempotency_key)
      values(invoice_row.id,receiving_account,total_paid,(session_at at time zone public.business_timezone())::date,received_method,nullif(btrim(received_reference),''),auth.uid(),request_key);
    end if;
    update public.patient_sessions set invoice_id=invoice_row.id where id=session_row.id returning * into session_row;
  end if;
  return session_row;
end
$$;
revoke all on function public.create_patient_session_with_payment(uuid,timestamptz,uuid,text,integer,text,integer,date,text,numeric,numeric,uuid,text,text,uuid) from public,anon;
grant execute on function public.create_patient_session_with_payment(uuid,timestamptz,uuid,text,integer,text,integer,date,text,numeric,numeric,uuid,text,text,uuid) to authenticated;

create or replace function public.record_invoice_payment_atomic(target_invoice uuid,target_account uuid,payment_amount numeric,paid_on date,method text,reference text,request_key uuid)
returns public.finance_invoice_payments language plpgsql security definer set search_path='' as $$
declare inv public.finance_invoices%rowtype; total numeric; paid numeric; payment public.finance_invoice_payments%rowtype; request_payload jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required.' using errcode='42501'; end if;
 if request_key is null then raise exception 'A payment operation key is required.' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invoice-payment:'||target_invoice::text||':'||request_key::text,0));
 request_payload:=jsonb_build_object('invoice_id',target_invoice,'account_id',target_account,'amount',payment_amount,'paid_on',paid_on,'method',method,'reference',nullif(btrim(reference),''));
 if not (public.has_permission('invoices.manage') or public.has_permission('finance.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into payment from public.finance_invoice_payments where received_by=auth.uid() and idempotency_key=request_key;
 if payment.id is not null then
   if payment.idempotency_payload is distinct from request_payload then raise exception 'This operation key was already used for a different payment payload.' using errcode='22023'; end if;
   return payment;
 end if;
 if exists(select 1 from public.finance_invoice_payments where invoice_id=target_invoice and idempotency_key=request_key) then
   raise exception 'This payment operation belongs to another actor.' using errcode='42501';
 end if;
 select * into inv from public.finance_invoices where id=target_invoice and archived_at is null for update;
 if inv.id is null then raise exception 'Invoice is not collectible.'; end if;
 if inv.status in ('cancelled','paid') then raise exception 'Invoice is not collectible.'; end if;
 if payment_amount is null or payment_amount<=0 or payment_amount>999999999999.99 or scale(payment_amount)>2 then raise exception 'Payment amount must be a valid positive amount with at most two decimals.'; end if;
 if coalesce(method,'') not in ('cash','bank_transfer','upi','card') then raise exception 'Choose an approved payment method.' using errcode='22023'; end if;
 if not exists(select 1 from public.finance_accounts where id=target_account and is_active) then raise exception 'Choose an active receiving account.' using errcode='22023'; end if;
 select coalesce(sum(quantity*rate),0)+inv.tax-inv.discount into total from public.finance_invoice_items where invoice_id=target_invoice;
 select coalesce(sum(amount),0) into paid from public.finance_invoice_payments where invoice_id=target_invoice;
 if payment_amount>total-paid then raise exception 'Payment exceeds the outstanding balance.'; end if;
 insert into public.finance_invoice_payments(invoice_id,account_id,amount,payment_date,payment_method,reference_number,received_by,idempotency_key,idempotency_payload)
 values(target_invoice,target_account,payment_amount,coalesce(paid_on,public.business_today()),method,nullif(btrim(reference),''),(select auth.uid()),request_key,request_payload) returning * into payment;
 update public.finance_invoices set status=case when paid+payment_amount>=total then 'paid' when due_date<public.business_today() then 'overdue' else 'partially_paid' end where id=target_invoice;
 return payment;
end $$;
revoke all on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text,uuid) from public,anon;
grant execute on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text,uuid) to authenticated,service_role;

create or replace function public.record_invoice_payment_atomic(
  target_invoice uuid,target_account uuid,payment_amount numeric,paid_on date,method text,reference text default null
) returns public.finance_invoice_payments language sql security definer set search_path='' as $$
  select public.record_invoice_payment_atomic(target_invoice,target_account,payment_amount,paid_on,method,reference,gen_random_uuid())
$$;
revoke all on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text) from public,anon;
grant execute on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text) to authenticated,service_role;

-- Keep the client charge independent of the practitioner payable snapshot.
alter table public.doctor_appointments
  add column if not exists session_fee numeric(14,2) check(session_fee is null or session_fee>=0),
  add column if not exists psychologist_fee_snapshot numeric(14,2) check(psychologist_fee_snapshot is null or psychologist_fee_snapshot>=0),
  add column if not exists creation_request_id uuid,
  add column if not exists creation_request_payload jsonb;
create unique index if not exists doctor_appointments_creator_request_unique
  on public.doctor_appointments(created_by,creation_request_id) where creation_request_id is not null;

create or replace function public.guard_appointment_finance_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(pg_catalog.current_setting('bsmile.appointment_finance_rpc',true),'')='on' then return new; end if;
  if tg_op='INSERT' or new.session_fee is distinct from old.session_fee
    or new.psychologist_fee_snapshot is distinct from old.psychologist_fee_snapshot
    or new.creation_request_id is distinct from old.creation_request_id
    or new.creation_request_payload is distinct from old.creation_request_payload then
    raise exception 'Appointment finance fields must be changed through the appointment workflow.' using errcode='42501';
  end if;
  return new;
end
$$;
revoke all on function public.guard_appointment_finance_fields() from public,anon,authenticated,service_role;
drop trigger if exists appointment_finance_fields_guard on public.doctor_appointments;
create trigger appointment_finance_fields_guard before insert or update of session_fee,psychologist_fee_snapshot,creation_request_id,creation_request_payload
on public.doctor_appointments for each row execute function public.guard_appointment_finance_fields();

create or replace function public.create_doctor_appointment_v2(
  target_patient uuid,target_doctor uuid,appointment_start timestamptz,appointment_end timestamptz,
  appointment_consultation_type text,client_session_fee numeric,appointment_remarks text,
  request_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; clinician public.outsourced_doctors%rowtype; payout numeric; request_payload jsonb; prior_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if request_key is null then raise exception 'An appointment operation key is required.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':appointment:'||request_key::text,0));
  request_payload:=jsonb_build_object('patient_id',target_patient,'doctor_id',target_doctor,'start_at',appointment_start,'end_at',appointment_end,'consultation_type',appointment_consultation_type,'session_fee',client_session_fee,'remarks',nullif(btrim(appointment_remarks),''));
  if not public.appointment_patient_access('create',target_patient) then raise exception 'Permission denied for appointment creation' using errcode='42501'; end if;
  if not exists(select 1 from public.patients where id=target_patient and deleted_at is null and archived_at is null) then raise exception 'Choose an active client.'; end if;
  select id,creation_request_payload into new_id,prior_payload from public.doctor_appointments where created_by=auth.uid() and creation_request_id=request_key;
  if new_id is not null then
    if prior_payload is distinct from request_payload then raise exception 'This operation key was already used for a different appointment payload.' using errcode='22023'; end if;
    return new_id;
  end if;
  if appointment_consultation_type not in ('in_person','online') then raise exception 'Choose a valid consultation type.'; end if;
  if client_session_fee is null or client_session_fee<0 or client_session_fee>999999999999.99 or scale(client_session_fee)>2 then raise exception 'Session fee must be a valid non-negative amount with at most two decimals.'; end if;
  if not public.doctor_slot_is_available(target_doctor,appointment_start,appointment_end,null) then raise exception 'This doctor is not available for the selected slot.'; end if;
  select * into clinician from public.outsourced_doctors where id=target_doctor and archived_at is null and status='active';
  if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;
  if clinician.clinician_type='outsourced' then
    select default_session_payout into payout from public.psychologist_payout_settings where doctor_id=target_doctor and is_active;
  end if;
  perform pg_catalog.set_config('bsmile.appointment_finance_rpc','on',true);
  insert into public.doctor_appointments(patient_id,doctor_id,start_at,end_at,consultation_type,remarks,session_fee,psychologist_fee_snapshot,creation_request_id,creation_request_payload,created_by,updated_by)
  values(target_patient,target_doctor,appointment_start,appointment_end,appointment_consultation_type,nullif(btrim(appointment_remarks),''),client_session_fee,payout,request_key,request_payload,auth.uid(),auth.uid()) returning id into new_id;
  insert into public.doctor_appointment_activity(appointment_id,actor_id,action,next_status,next_start_at,remarks)
  values(new_id,auth.uid(),'created','scheduled',appointment_start,nullif(btrim(appointment_remarks),''));
  perform public.log_doctor_appointment_patient_activity(new_id,target_patient,'appointment_scheduled',auth.uid(),jsonb_build_object('doctor_id',target_doctor,'start_at',appointment_start,'end_at',appointment_end,'session_fee',client_session_fee));
  perform public.notify_user(auth.uid(),'Appointment created','Doctor appointment has been scheduled.','doctor_appointment_created',new_id,'/admin/doctor-scheduling?appointment='||new_id::text,auth.uid(),'appointments','normal','none',false,jsonb_build_object('appointment_id',new_id,'patient_id',target_patient));
  return new_id;
end $$;
revoke all on function public.create_doctor_appointment_v2(uuid,uuid,timestamptz,timestamptz,text,numeric,text,uuid) from public,anon;
grant execute on function public.create_doctor_appointment_v2(uuid,uuid,timestamptz,timestamptz,text,numeric,text,uuid) to authenticated,service_role;

create or replace function public.update_doctor_appointment_v2(
  target_appointment uuid,target_doctor uuid,appointment_start timestamptz,appointment_end timestamptz,
  appointment_consultation_type text,next_status text,client_session_fee numeric,appointment_remarks text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_row public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; payout numeric; action_name text:='appointment_edited';
begin
  select * into current_row from public.doctor_appointments where id=target_appointment and deleted_at is null;
  if current_row.id is null then raise exception 'Appointment unavailable.'; end if;
  if auth.uid() is null or not public.appointment_patient_access('update',current_row.patient_id) then raise exception 'Permission denied for appointment update' using errcode='42501'; end if;
  if appointment_consultation_type not in ('in_person','online') or next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then raise exception 'Choose valid appointment details.'; end if;
  if client_session_fee is null or client_session_fee<0 or client_session_fee>999999999999.99 or scale(client_session_fee)>2 then raise exception 'Session fee must be a valid non-negative amount with at most two decimals.'; end if;
  if current_row.status='completed' and client_session_fee is distinct from current_row.session_fee then raise exception 'A completed appointment session fee cannot be changed.' using errcode='22023'; end if;
  if current_row.status='completed' and (
    target_doctor is distinct from current_row.doctor_id or appointment_start is distinct from current_row.start_at
    or appointment_end is distinct from current_row.end_at or appointment_consultation_type is distinct from current_row.consultation_type
  ) then raise exception 'Completed appointment details cannot be changed.' using errcode='22023'; end if;
  if next_status='cancelled' and not public.appointment_patient_access('cancel',current_row.patient_id) then raise exception 'Permission denied for cancellation' using errcode='42501'; end if;
  if next_status in ('confirmed','completed','no_show') and not public.appointment_patient_access('update_status',current_row.patient_id) then raise exception 'Permission denied for status updates' using errcode='42501'; end if;
  if target_doctor is distinct from current_row.doctor_id or appointment_start is distinct from current_row.start_at or appointment_end is distinct from current_row.end_at then
    if not public.appointment_patient_access('reschedule',current_row.patient_id) then raise exception 'Permission denied for rescheduling' using errcode='42501'; end if;
    action_name:='appointment_rescheduled';
    if not public.doctor_slot_is_available(target_doctor,appointment_start,appointment_end,target_appointment) then raise exception 'This doctor is not available for the selected slot.'; end if;
  end if;
  if target_doctor is distinct from current_row.doctor_id then
    select * into clinician from public.outsourced_doctors where id=target_doctor and archived_at is null and status='active';
    if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;
    if clinician.clinician_type='outsourced' then
      select default_session_payout into payout from public.psychologist_payout_settings where doctor_id=target_doctor and is_active;
    end if;
  else
    payout:=current_row.psychologist_fee_snapshot;
  end if;
  perform pg_catalog.set_config('bsmile.appointment_finance_rpc','on',true);
  update public.doctor_appointments set doctor_id=target_doctor,start_at=appointment_start,end_at=appointment_end,consultation_type=appointment_consultation_type,status=next_status,remarks=nullif(btrim(appointment_remarks),''),session_fee=client_session_fee,psychologist_fee_snapshot=payout,updated_by=auth.uid() where id=target_appointment;
  insert into public.doctor_appointment_activity(appointment_id,actor_id,action,previous_status,next_status,previous_start_at,next_start_at,remarks)
  values(target_appointment,auth.uid(),action_name,current_row.status,next_status,current_row.start_at,appointment_start,nullif(btrim(appointment_remarks),''));
  perform public.log_doctor_appointment_patient_activity(target_appointment,current_row.patient_id,action_name,auth.uid(),jsonb_build_object('doctor_id',target_doctor,'previous_doctor_id',current_row.doctor_id,'previous_start_at',current_row.start_at,'start_at',appointment_start,'status',next_status,'previous_session_fee',current_row.session_fee,'session_fee',client_session_fee));
  return target_appointment;
end $$;
revoke all on function public.update_doctor_appointment_v2(uuid,uuid,timestamptz,timestamptz,text,text,numeric,text) from public,anon;
grant execute on function public.update_doctor_appointment_v2(uuid,uuid,timestamptz,timestamptz,text,text,numeric,text) to authenticated,service_role;

-- Preserve migration-first compatibility for the currently deployed client.
-- Its appointment_fee argument is a clinician payout snapshot; it must never
-- be reinterpreted as the new, independent client session charge.
create or replace function public.create_doctor_appointment(
  target_patient uuid,target_doctor uuid,appointment_start timestamptz,appointment_end timestamptz,
  appointment_consultation_type text,appointment_fee numeric,appointment_remarks text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; clinician public.outsourced_doctors%rowtype;
begin
  if auth.uid() is null or not public.appointment_patient_access('create',target_patient) then raise exception 'Permission denied for appointment creation' using errcode='42501'; end if;
  if appointment_consultation_type not in ('in_person','online') then raise exception 'Choose a valid consultation type.'; end if;
  if appointment_fee is null or appointment_fee<0 or appointment_fee>999999999999.99 or scale(appointment_fee)>2 then raise exception 'Appointment fee must be a valid non-negative amount with at most two decimals.' using errcode='22003'; end if;
  if not exists(select 1 from public.patients where id=target_patient and deleted_at is null and archived_at is null) then raise exception 'Choose an active client.'; end if;
  if not public.doctor_slot_is_available(target_doctor,appointment_start,appointment_end,null) then raise exception 'This doctor is not available for the selected slot.'; end if;
  select * into clinician from public.outsourced_doctors where id=target_doctor and archived_at is null and status='active';
  if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;
  perform pg_catalog.set_config('bsmile.appointment_finance_rpc','on',true);
  insert into public.doctor_appointments(patient_id,doctor_id,start_at,end_at,consultation_type,remarks,session_fee,psychologist_fee_snapshot,created_by,updated_by)
  values(target_patient,target_doctor,appointment_start,appointment_end,appointment_consultation_type,nullif(pg_catalog.btrim(appointment_remarks),''),null,appointment_fee,auth.uid(),auth.uid()) returning id into new_id;
  insert into public.doctor_appointment_activity(appointment_id,actor_id,action,next_status,next_start_at,remarks)
  values(new_id,auth.uid(),'created','scheduled',appointment_start,nullif(pg_catalog.btrim(appointment_remarks),''));
  perform public.log_doctor_appointment_patient_activity(new_id,target_patient,'appointment_scheduled',auth.uid(),jsonb_build_object('doctor_id',target_doctor,'start_at',appointment_start,'end_at',appointment_end,'appointment_fee',appointment_fee));
  perform public.notify_user(auth.uid(),'Appointment created','Doctor appointment has been scheduled.','doctor_appointment_created',new_id,'/admin/doctor-scheduling?appointment='||new_id::text,auth.uid(),'appointments','normal','none',false,jsonb_build_object('appointment_id',new_id,'patient_id',target_patient));
  return new_id;
end
$$;
revoke all on function public.create_doctor_appointment(uuid,uuid,timestamptz,timestamptz,text,numeric,text) from public,anon;
grant execute on function public.create_doctor_appointment(uuid,uuid,timestamptz,timestamptz,text,numeric,text) to authenticated,service_role;

create or replace function public.update_doctor_appointment(
  target_appointment uuid,target_doctor uuid,appointment_start timestamptz,appointment_end timestamptz,
  appointment_consultation_type text,next_status text,appointment_fee numeric,appointment_remarks text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_row public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; action_name text:='appointment_edited';
begin
  select * into current_row from public.doctor_appointments where id=target_appointment and deleted_at is null;
  if current_row.id is null then raise exception 'Appointment unavailable.'; end if;
  if auth.uid() is null or not public.appointment_patient_access('update',current_row.patient_id) then raise exception 'Permission denied for appointment update' using errcode='42501'; end if;
  if appointment_consultation_type not in ('in_person','online') or next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then raise exception 'Choose valid appointment details.'; end if;
  if appointment_fee is null or appointment_fee<0 or appointment_fee>999999999999.99 or scale(appointment_fee)>2 then raise exception 'Appointment fee must be a valid non-negative amount with at most two decimals.' using errcode='22003'; end if;
  if current_row.status='completed' and appointment_fee is distinct from current_row.psychologist_fee_snapshot then raise exception 'A completed appointment fee cannot be changed.' using errcode='22023'; end if;
  if current_row.status='completed' and (target_doctor is distinct from current_row.doctor_id or appointment_start is distinct from current_row.start_at or appointment_end is distinct from current_row.end_at or appointment_consultation_type is distinct from current_row.consultation_type) then raise exception 'Completed appointment details cannot be changed.' using errcode='22023'; end if;
  if next_status='cancelled' and not public.appointment_patient_access('cancel',current_row.patient_id) then raise exception 'Permission denied for cancellation' using errcode='42501'; end if;
  if next_status in ('confirmed','completed','no_show') and not public.appointment_patient_access('update_status',current_row.patient_id) then raise exception 'Permission denied for status updates' using errcode='42501'; end if;
  if target_doctor is distinct from current_row.doctor_id or appointment_start is distinct from current_row.start_at or appointment_end is distinct from current_row.end_at then
    if not public.appointment_patient_access('reschedule',current_row.patient_id) then raise exception 'Permission denied for rescheduling' using errcode='42501'; end if;
    action_name:='appointment_rescheduled';
    if not public.doctor_slot_is_available(target_doctor,appointment_start,appointment_end,target_appointment) then raise exception 'This doctor is not available for the selected slot.'; end if;
  end if;
  select * into clinician from public.outsourced_doctors where id=target_doctor and archived_at is null and status='active';
  if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;
  perform pg_catalog.set_config('bsmile.appointment_finance_rpc','on',true);
  update public.doctor_appointments set doctor_id=target_doctor,start_at=appointment_start,end_at=appointment_end,consultation_type=appointment_consultation_type,status=next_status,remarks=nullif(pg_catalog.btrim(appointment_remarks),''),psychologist_fee_snapshot=appointment_fee,updated_by=auth.uid() where id=target_appointment;
  insert into public.doctor_appointment_activity(appointment_id,actor_id,action,previous_status,next_status,previous_start_at,next_start_at,remarks)
  values(target_appointment,auth.uid(),action_name,current_row.status,next_status,current_row.start_at,appointment_start,nullif(pg_catalog.btrim(appointment_remarks),''));
  perform public.log_doctor_appointment_patient_activity(target_appointment,current_row.patient_id,action_name,auth.uid(),jsonb_build_object('doctor_id',target_doctor,'previous_doctor_id',current_row.doctor_id,'previous_start_at',current_row.start_at,'start_at',appointment_start,'status',next_status,'previous_appointment_fee',current_row.psychologist_fee_snapshot,'appointment_fee',appointment_fee));
  return target_appointment;
end
$$;
revoke all on function public.update_doctor_appointment(uuid,uuid,timestamptz,timestamptz,text,text,numeric,text) from public,anon;
grant execute on function public.update_doctor_appointment(uuid,uuid,timestamptz,timestamptz,text,text,numeric,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Reversible client archive/restore and bounded appointment selection
-- ---------------------------------------------------------------------------
alter table public.patients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete restrict,
  add column if not exists archive_reason text;

create table if not exists public.patient_archive_events(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  action text not null check(action in ('archived','restored')),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.patient_archive_events enable row level security;
drop policy if exists "patient archive events authorized read" on public.patient_archive_events;
create policy "patient archive events authorized read" on public.patient_archive_events for select to authenticated
  using(public.has_permission('patients.archive') and public.patient_access(patient_id));
grant select on public.patient_archive_events to authenticated;

create or replace function public.patient_care_access(patient uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.patients p where p.id=patient and p.deleted_at is null
    and (public.has_permission('patients.view_all')
      or (public.has_permission('patients.view') and (p.assigned_psychologist_id=auth.uid() or p.created_by=auth.uid() or public.patient_is_assigned(p.id)
        or (replace(lower(public.current_role()::text),' ','_')='general_manager' and (p.assigned_psychologist_id is null or public.in_management_tree(p.assigned_psychologist_id)))))
      or (public.has_permission('patients.view_assigned') and public.patient_is_assigned(p.id))))
$$;

-- Historical records stay readable after archival, while every appointment
-- mutation path (including SECURITY DEFINER RPCs) requires an active client.
create or replace function public.appointment_patient_access(action text,target_patient uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.appointment_has_permission(action)
    and public.patient_care_access(target_patient)
    and (
      action='view'
      or exists(select 1 from public.patients p where p.id=target_patient and p.deleted_at is null and p.archived_at is null)
    )
$$;
revoke all on function public.appointment_patient_access(text,uuid) from public,anon;
grant execute on function public.appointment_patient_access(text,uuid) to authenticated;

-- Archived clients remain readable as history, but every direct care mutation
-- is denied. Archive/restore themselves run through the audited definer RPCs.
drop policy if exists "active clients only for patient updates" on public.patients;
create policy "active clients only for patient updates" on public.patients as restrictive
  for update to authenticated using(archived_at is null) with check(archived_at is null);

drop policy if exists "active clients only for session inserts" on public.patient_sessions;
create policy "active clients only for session inserts" on public.patient_sessions as restrictive
  for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for session updates" on public.patient_sessions;
create policy "active clients only for session updates" on public.patient_sessions as restrictive
  for update to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null))
  with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for session deletes" on public.patient_sessions;
create policy "active clients only for session deletes" on public.patient_sessions as restrictive
  for delete to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));

drop policy if exists "active clients only for note inserts" on public.patient_notes;
create policy "active clients only for note inserts" on public.patient_notes as restrictive
  for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for note updates" on public.patient_notes;
create policy "active clients only for note updates" on public.patient_notes as restrictive
  for update to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null))
  with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for note deletes" on public.patient_notes;
create policy "active clients only for note deletes" on public.patient_notes as restrictive
  for delete to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));

drop policy if exists "active clients only for document inserts" on public.patient_documents;
create policy "active clients only for document inserts" on public.patient_documents as restrictive
  for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for document updates" on public.patient_documents;
create policy "active clients only for document updates" on public.patient_documents as restrictive
  for update to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null))
  with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for document deletes" on public.patient_documents;
create policy "active clients only for document deletes" on public.patient_documents as restrictive
  for delete to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));

drop policy if exists "active clients only for appointment inserts" on public.doctor_appointments;
create policy "active clients only for appointment inserts" on public.doctor_appointments as restrictive
  for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for appointment updates" on public.doctor_appointments;
create policy "active clients only for appointment updates" on public.doctor_appointments as restrictive
  for update to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null))
  with check(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));
drop policy if exists "active clients only for appointment deletes" on public.doctor_appointments;
create policy "active clients only for appointment deletes" on public.doctor_appointments as restrictive
  for delete to authenticated using(exists(select 1 from public.patients p where p.id=patient_id and p.deleted_at is null and p.archived_at is null));

create or replace function public.patient_archive_preview(target_patient uuid)
returns table(future_appointments bigint,outstanding_balance numeric,session_count bigint,payment_count bigint)
language sql stable security definer set search_path='' as $$
  select
    (select count(*) from public.doctor_appointments a where a.patient_id=target_patient and a.deleted_at is null and a.start_at>now() and a.status not in ('cancelled','no_show')),
    (select coalesce(sum(greatest(0,coalesce(i.total,0)-coalesce(i.paid,0))),0) from (
      select f.id,
        coalesce((select sum(item.quantity*item.rate) from public.finance_invoice_items item where item.invoice_id=f.id),0)+f.tax-f.discount total,
        coalesce((select sum(pay.amount) from public.finance_invoice_payments pay where pay.invoice_id=f.id),0) paid
      from public.finance_invoices f
      where f.patient_id=target_patient and f.archived_at is null and f.status<>'cancelled'
    ) i),
    (select count(*) from public.patient_sessions s where s.patient_id=target_patient and s.deleted_at is null),
    (select count(*) from public.finance_invoice_payments pay join public.finance_invoices f on f.id=pay.invoice_id where f.patient_id=target_patient)
  where public.has_permission('patients.archive') and public.patient_access(target_patient)
$$;
revoke all on function public.patient_archive_preview(uuid) from public,anon;
grant execute on function public.patient_archive_preview(uuid) to authenticated;

create or replace function public.archive_patient(target_patient uuid, reason text, acknowledge_outstanding boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare preview record;
begin
  if auth.uid() is null or not public.has_permission('patients.archive') then raise exception 'Permission denied for client archival.' using errcode='42501'; end if;
  if not public.patient_access(target_patient) then raise exception 'Client not found or access denied.' using errcode='42501'; end if;
  if nullif(btrim(reason),'') is null then raise exception 'Archive reason is required.'; end if;
  perform 1 from public.patients where id=target_patient and deleted_at is null and archived_at is null for update;
  if not found then raise exception 'Client not found.' using errcode='P0002'; end if;
  select * into preview from public.patient_archive_preview(target_patient);
  if preview.future_appointments>0 then raise exception 'Cancel or reschedule future appointments before archiving.'; end if;
  if preview.outstanding_balance>0 and not acknowledge_outstanding then raise exception 'Outstanding payments must be acknowledged before archiving.'; end if;
  update public.patients set archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(reason),updated_at=now() where id=target_patient;
  insert into public.patient_archive_events(patient_id,action,actor_id,reason,metadata)
  values(target_patient,'archived',auth.uid(),btrim(reason),jsonb_build_object('future_appointments',preview.future_appointments,'outstanding_balance',preview.outstanding_balance,'session_count',preview.session_count,'payment_count',preview.payment_count));
  return target_patient;
end $$;
revoke all on function public.archive_patient(uuid,text,boolean) from public,anon;
grant execute on function public.archive_patient(uuid,text,boolean) to authenticated;

create or replace function public.restore_patient(target_patient uuid, reason text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_permission('patients.archive') then raise exception 'Permission denied for client restoration.' using errcode='42501'; end if;
  if not public.patient_access(target_patient) then raise exception 'Client not found or access denied.' using errcode='42501'; end if;
  if nullif(btrim(reason),'') is null then raise exception 'Restore reason is required.'; end if;
  update public.patients set archived_at=null,archived_by=null,archive_reason=null,updated_at=now() where id=target_patient and deleted_at is null and archived_at is not null;
  if not found then raise exception 'Archived client not found.' using errcode='P0002'; end if;
  insert into public.patient_archive_events(patient_id,action,actor_id,reason) values(target_patient,'restored',auth.uid(),btrim(reason));
  return target_patient;
end $$;
revoke all on function public.restore_patient(uuid,text) from public,anon;
grant execute on function public.restore_patient(uuid,text) to authenticated;

create or replace function public.appointment_patient_options(search_text text default null,page_offset integer default 0,page_size integer default 40,selected_patient uuid default null)
returns table(id uuid,full_name text,patient_number text,phone text,slug text)
language sql stable security definer set search_path='' as $$
  select p.id,p.full_name,p.patient_number,p.phone,p.slug
  from public.patients p
  where auth.uid() is not null
    and (public.has_permission('appointments.create') or public.has_permission('doctor_scheduling.create_appointments'))
    and public.patient_care_access(p.id)
    and p.deleted_at is null and p.archived_at is null
    and (p.id=selected_patient or nullif(btrim(search_text),'') is null or p.full_name ilike '%'||btrim(search_text)||'%' or p.patient_number ilike '%'||btrim(search_text)||'%' or p.phone ilike '%'||btrim(search_text)||'%')
  order by (p.id=selected_patient) desc,lower(p.full_name),p.id
  offset greatest(page_offset,0) limit least(greatest(page_size,1),100)
$$;
revoke all on function public.appointment_patient_options(text,integer,integer,uuid) from public,anon;
grant execute on function public.appointment_patient_options(text,integer,integer,uuid) to authenticated;

-- Preserve the original conversion timestamp and repair only proven FK chains.
create or replace function public.reconcile_converted_patient_finance(target_lead uuid,target_patient uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.finance_invoices invoice set patient_id=target_patient
  from public.crm_sales sale
  where sale.lead_id=target_lead and invoice.sale_id=sale.id and invoice.patient_id is null;
  get diagnostics changed=row_count;
  return changed;
end $$;
revoke all on function public.reconcile_converted_patient_finance(uuid,uuid) from public,anon;

-- The existing converter remains authoritative for validation and field mapping.
-- This trigger repairs its two unsafe postconditions without name/phone/email matching.
create or replace function public.preserve_lead_conversion_linkage()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.converted_at is not null and new.converted_at is distinct from old.converted_at then new.converted_at:=old.converted_at; end if;
  if old.converted_patient_id is null and new.converted_patient_id is not null then perform public.reconcile_converted_patient_finance(new.id,new.converted_patient_id); end if;
  return new;
end $$;
drop trigger if exists preserve_lead_conversion_linkage on public.crm_leads;
create trigger preserve_lead_conversion_linkage before update of converted_at,converted_patient_id on public.crm_leads
for each row execute function public.preserve_lead_conversion_linkage();

notify pgrst, 'reload schema';
