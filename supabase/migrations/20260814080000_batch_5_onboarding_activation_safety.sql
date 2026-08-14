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

notify pgrst,'reload schema';
