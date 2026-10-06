-- Task-owned schema only. No production identity grants or source imports.
-- Preserve each environment's internal rules while adding an external boundary.
create schema if not exists clinician_private;
revoke all on schema clinician_private from public, anon, authenticated;

do $$
declare signature text; definition text; name text;
begin
  foreach signature in array array[
    'public.has_permission(text,uuid)', 'public.patient_care_access(uuid)',
    'public.patient_document_access(public.patient_documents)',
    'public.can_manage_clinician(uuid)', 'public.profile_can_operationally_edit(uuid)'
  ] loop
    name := split_part(split_part(signature, '.', 2), '(', 1);
    definition := pg_get_functiondef(signature::regprocedure);
    definition := replace(definition, 'FUNCTION public.' || name || '(',
      'FUNCTION clinician_private.internal_' || name || '(');
    execute definition;
  end loop;
end $$;

revoke all on all functions in schema clinician_private from public, anon, authenticated;

insert into public.permissions(code,description) values
 ('outsourced_clinicians.manage','Manage outsourced clinician profiles and availability; explicit internal grant required'),
 ('employees.identity.view','Read the restricted employee identity editor'),
 ('employees.identity.edit','Edit employee identity and code through the audited identity mutation'),
 ('clinician.workspace','Use an approved external clinician workspace'),
 ('clinician.clients.read','Read assigned-client clinician projections'),
 ('clinician.appointments.respond','Respond to own appointments without scheduling administration'),
 ('clinician.notes.write','Write own assigned appointment/session clinical notes'),
 ('clinician.followups.write','Write own assigned operational follow-ups'),
 ('clinician.profile.edit','Edit permitted own contact, photo and professional fields'),
 ('clinical_followups.view_operational','Read minimal operational clinical follow-ups without clinical care access')
on conflict(code) do nothing;

create or replace function public.is_external_profile(subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=subject_id and not p.is_employee)
$$;

create or replace function public.active_direct_permission(permission_code text,subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p
 join public.user_permission_grants g on g.profile_id=p.id
 join public.permissions permission on permission.id=g.permission_id
 where p.id=subject_id and p.status::text='active' and p.login_enabled
 and not p.onboarding_required and permission.code=permission_code
 and g.revoked_at is null and g.starts_at<=now()
 and (g.expires_at is null or g.expires_at>now()))
$$;

-- Legacy role-only helpers must also respect employee classification.
create or replace function public."current_role"()
returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and is_employee
$$;
revoke all on function public."current_role"() from public,anon;
grant execute on function public."current_role"() to authenticated,service_role;

create or replace function public.external_clinician_eligible(subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p
 join auth.users identity on identity.id=p.id
 join public.outsourced_doctors d on d.profile_id=p.id
 where p.id=subject_id and not p.is_employee and p.status::text='active'
 and p.login_enabled and not p.onboarding_required
 and identity.email_confirmed_at is not null
 and (identity.banned_until is null or identity.banned_until<=now())
 and d.clinician_type='outsourced' and d.status='active'
 and d.archived_at is null and d.self_service_enabled
 and public.active_direct_permission('clinician.workspace',subject_id))
$$;

create or replace function public.has_permission(permission_code text,subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when public.is_external_profile(subject_id) then
  public.external_clinician_eligible(subject_id)
  and permission_code=any(array[
   'clinician.workspace','clinician.clients.read','clinician.appointments.respond',
   'clinician.notes.write','clinician.followups.write','clinician.profile.edit',
   'clinician.schedule.view_own','clinician.appointments.view_own',
   'patient_documents.view','patient_documents.upload','patient_documents.download',
   'clinical_notes.view','clinical_notes.create','clinical_notes.edit','chat.use'])
  and public.active_direct_permission(permission_code,subject_id)
 when permission_code=any(array['outsourced_clinicians.manage','employees.identity.view',
   'employees.identity.edit','clinical_followups.view_operational']) then
  exists(select 1 from public.profiles p where p.id=subject_id and p.is_employee)
  and public.active_direct_permission(permission_code,subject_id)
 else clinician_private.internal_has_permission(permission_code,subject_id) end
$$;

create or replace function public.current_clinician_id()
returns uuid language sql stable security definer set search_path='' as $$
 select d.id from public.outsourced_doctors d join public.profiles p on p.id=d.profile_id
 where d.profile_id=(select auth.uid()) and d.self_service_enabled
 and d.archived_at is null and p.login_enabled and p.status::text='active'
 and not p.onboarding_required
 and (p.is_employee or public.external_clinician_eligible(p.id)) limit 1
$$;

create or replace function public.can_manage_clinician(target_doctor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.outsourced_doctors d where d.id=target_doctor
 and d.archived_at is null and case when d.clinician_type='outsourced'
 then public.has_permission('outsourced_clinicians.manage')
 else not public.is_external_profile() and clinician_private.internal_can_manage_clinician(target_doctor) end)
$$;

create or replace function public.external_patient_access(target_patient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('clinician.clients.read') and exists(
 select 1 from public.patients p where p.id=target_patient and p.deleted_at is null
 and (exists(select 1 from public.doctor_appointments a where a.patient_id=p.id
 and a.doctor_id=public.current_clinician_id() and a.deleted_at is null)
 or public.patient_is_assigned(p.id,(select auth.uid()))))
$$;

create or replace function public.patient_care_access(patient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when public.is_external_profile() then public.external_patient_access(patient)
 else clinician_private.internal_patient_care_access(patient) end
$$;

create or replace function public.patient_document_access(doc public.patient_documents)
returns boolean language sql stable security definer set search_path='' as $$
 select case when public.is_external_profile() then
 public.external_patient_access(doc.patient_id) and public.has_permission('patient_documents.view')
 and doc.deleted_at is null and doc.archived_at is null
 and lower(btrim(doc.category))=any(array['case history','session records','referral forms','clinical documents'])
 and doc.visibility=any(array['general_staff','assigned_psychologist','clinical_team'])
 else clinician_private.internal_patient_document_access(doc) end
$$;

-- Block broad existing role paths at the table boundary. The clinician APIs
-- below return minimal projections instead of exposing finance/HR columns.
do $$
declare item record;
begin
 for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and c.relname<>all(array['profiles','doctor_weekly_availability','doctor_blocked_periods',
 'patient_documents','patient_notes','notifications','notification_preferences','push_subscriptions',
 'chat_channels','chat_conversations','chat_members','chat_messages','chat_message_mentions',
 'chat_message_reactions','chat_message_reads']) loop
  execute format('create policy "external workforce boundary" on public.%I as restrictive for all to authenticated using (not public.is_external_profile()) with check (not public.is_external_profile())',item.relname);
 end loop;
end $$;

-- The old blocked-period policy explicitly OR-ed own identity and broad roles.
-- A restrictive target predicate prevents that path bypassing the new scope.
create policy "outsourced availability target scope" on public.doctor_weekly_availability
as restrictive for insert to authenticated with check(public.can_manage_clinician(doctor_id));
create policy "outsourced availability update scope" on public.doctor_weekly_availability
as restrictive for update to authenticated using(public.can_manage_clinician(doctor_id)) with check(public.can_manage_clinician(doctor_id));
create policy "outsourced availability delete scope" on public.doctor_weekly_availability
as restrictive for delete to authenticated using(public.can_manage_clinician(doctor_id));
create policy "outsourced blocked insert scope" on public.doctor_blocked_periods
as restrictive for insert to authenticated with check(public.can_manage_clinician(doctor_id));
create policy "outsourced blocked update scope" on public.doctor_blocked_periods
as restrictive for update to authenticated using(public.can_manage_clinician(doctor_id)) with check(public.can_manage_clinician(doctor_id));
create policy "outsourced blocked delete scope" on public.doctor_blocked_periods
as restrictive for delete to authenticated using(public.can_manage_clinician(doctor_id));
create policy "scoped outsourced blocked management" on public.doctor_blocked_periods
for all to authenticated using(public.can_manage_clinician(doctor_id))
with check(public.can_manage_clinician(doctor_id) and created_by=(select auth.uid()));

-- Direct broad management of outsourced identity also requires target scope.
create policy "outsourced identity target insert" on public.outsourced_doctors
as restrictive for insert to authenticated with check(clinician_type<>'outsourced' or public.has_permission('outsourced_clinicians.manage'));
create policy "outsourced identity target update" on public.outsourced_doctors
as restrictive for update to authenticated
using(clinician_type<>'outsourced' or public.has_permission('outsourced_clinicians.manage'))
with check(clinician_type<>'outsourced' or public.has_permission('outsourced_clinicians.manage'));
create policy "outsourced identity target delete" on public.outsourced_doctors
as restrictive for delete to authenticated using(clinician_type<>'outsourced');
create policy "scoped outsourced registry management" on public.outsourced_doctors
for select to authenticated using(public.has_permission('outsourced_clinicians.manage'));

alter table public.outsourced_doctors add column professional_information text;
alter table public.profiles add constraint external_employee_code_not_applicable
check(is_employee or employee_code is null) not valid;
create unique index employee_identity_trimmed_code_unique on public.profiles((nullif(btrim(employee_code),''))) where is_employee;

create or replace function public.can_edit_employee_identity(target_profile uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('employees.identity.edit') and exists(
 select 1 from public.profiles p where p.id=target_profile and p.is_employee
 and (not public.profile_role_is_protected(p.role::text) or public.has_permission('employees.manage')))
$$;

create or replace function public.profile_can_operationally_edit(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when public.is_external_profile(target) then
 (target=(select auth.uid()) and public.has_permission('clinician.profile.edit'))
 or (public.has_permission('outsourced_clinicians.manage') and exists(
 select 1 from public.outsourced_doctors d where d.profile_id=target and d.clinician_type='outsourced' and d.archived_at is null))
 else not public.is_external_profile() and (
 clinician_private.internal_profile_can_operationally_edit(target)
 or public.can_edit_employee_identity(target)) end
$$;

create or replace function public.guard_clinician_profile_fields()
returns trigger language plpgsql security definer set search_path='' as $$
declare protected jsonb; code_changed boolean;
begin
 new.employee_code:=nullif(btrim(new.employee_code),'');
 if not new.is_employee and new.employee_code is not null then
  raise exception 'Employee Code is not applicable to outsourced clinicians.' using errcode='23514';
 end if;
 if tg_op='INSERT' or auth.uid() is null then return new; end if;
 if not old.is_employee and (
   to_jsonb(new)-array['full_name','phone','personal_email','avatar_url','updated_at','last_seen_at']
   is distinct from to_jsonb(old)-array['full_name','phone','personal_email','avatar_url','updated_at','last_seen_at']) then
  raise exception 'Only display contact and photo fields may be edited.' using errcode='42501';
 end if;
 if old.is_employee and new.employee_code is distinct from old.employee_code
 and not public.can_edit_employee_identity(old.id) then
  raise exception 'Employee Code editing requires identity permission.' using errcode='42501';
 end if;
 if old.is_employee and public.can_edit_employee_identity(old.id)
 and not public.has_permission('employees.edit') and not public.has_permission('employees.manage')
 and (to_jsonb(new)-array['full_name','phone','gender','employee_code','department_id','designation','manager_id','joining_date','employment_type','updated_at']
 is distinct from to_jsonb(old)-array['full_name','phone','gender','employee_code','department_id','designation','manager_id','joining_date','employment_type','updated_at']) then
  raise exception 'The identity editor cannot change login, role, access or HR fields.' using errcode='42501';
 end if;
 if old.is_employee and not public.has_permission('employees.edit') and not public.has_permission('employees.manage')
 and not public.can_edit_employee_identity(old.id)
 and (to_jsonb(new)-array['full_name','phone','personal_email','date_of_birth','gender','address','emergency_contact','bank_details','avatar_url','updated_at','last_seen_at']
 is distinct from to_jsonb(old)-array['full_name','phone','personal_email','date_of_birth','gender','address','emergency_contact','bank_details','avatar_url','updated_at','last_seen_at']) then
  raise exception 'Employment fields require identity permission.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger profiles_clinician_identity_guard before insert or update on public.profiles
for each row execute function public.guard_clinician_profile_fields();

-- Allow the scoped identity editor through the original self-update guard,
-- while keeping every original check for callers without the new permission.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.enforce_profile_self_update()'::regprocedure);
 definition:=regexp_replace(definition,'not public.is_management\(\)',
  'not public.is_management() and not public.can_edit_employee_identity(old.id)','g');
 execute definition;
 definition:=pg_get_functiondef('public.profile_operational_activity_event()'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M',
  'begin if not new.is_employee then return new; end if;','i');
 execute definition;
end $$;

create or replace function public.employee_identity_code_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb;
begin
 if not new.is_employee then return new; end if;
 changes:=jsonb_strip_nulls(jsonb_build_object(
 'employee_code',case when new.employee_code is distinct from old.employee_code then jsonb_build_object('from',old.employee_code,'to',new.employee_code) end,
 'gender',case when new.gender is distinct from old.gender then jsonb_build_object('from',old.gender,'to',new.gender) end));
 if changes<>'{}'::jsonb then insert into public.employee_activity_logs(profile_id,actor_id,action,changes)
 values(new.id,auth.uid(),'employee_identity_updated',changes); end if;
 return new;
end $$;
create trigger employee_identity_code_audit after update on public.profiles
for each row execute function public.employee_identity_code_activity();

create or replace function public.employee_identity_directory(search_text text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.has_permission('employees.identity.view') or public.has_permission('employees.identity.edit')) then
 raise exception 'Identity read permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',p.phone,
 'gender',p.gender,'employee_code',p.employee_code,'department_id',p.department_id,'designation',p.designation,
 'manager_id',p.manager_id,'joining_date',p.joining_date,'employment_type',p.employment_type,
 'status',p.status,'role',p.role,'workforce_visible',p.workforce_visible)) from public.profiles p
 where p.is_employee and p.full_name ilike '%'||btrim(search_text)||'%'
 and (not public.profile_role_is_protected(p.role::text) or public.has_permission('employees.manage'))),'[]'::jsonb);
end $$;

create or replace function public.employee_identity_options()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('employees.identity.edit') then raise exception 'Identity edit permission required.' using errcode='42501'; end if;
 return jsonb_build_object('departments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]'::jsonb) from public.departments where is_active),
 'managers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'designation',designation)),'[]'::jsonb)
 from public.profiles where is_employee and workforce_visible and status::text='active'));
end $$;

create or replace function public.edit_employee_identity(target_profile uuid,patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.can_edit_employee_identity(target_profile) then raise exception 'Identity edit permission required for this employee.' using errcode='42501'; end if;
 if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k<>all(array[
 'full_name','phone','gender','employee_code','department_id','designation','manager_id','joining_date','employment_type'])) then
 raise exception 'Unsupported employee identity field.' using errcode='22023'; end if;
 if patch?'full_name' and nullif(btrim(patch->>'full_name'),'') is null then raise exception 'Full name is required.'; end if;
 if patch?'gender' and patch->>'gender' is not null and patch->>'gender'<>all(array['male','female','other','prefer_not_to_say']) then raise exception 'Invalid gender.'; end if;
 if patch?'manager_id' and nullif(patch->>'manager_id','') is not null and not exists(
 select 1 from public.profiles where id=(patch->>'manager_id')::uuid and is_employee and workforce_visible and status::text='active') then raise exception 'Choose an active employee as reporting manager.'; end if;
 if patch?'department_id' and nullif(patch->>'department_id','') is not null and not exists(
 select 1 from public.departments where id=(patch->>'department_id')::uuid and is_active) then raise exception 'Choose an active department.'; end if;
 update public.profiles p set
 full_name=case when patch?'full_name' then btrim(patch->>'full_name') else p.full_name end,
 phone=case when patch?'phone' then nullif(btrim(patch->>'phone'),'') else p.phone end,
 gender=case when patch?'gender' then patch->>'gender' else p.gender end,
 employee_code=case when patch?'employee_code' then nullif(btrim(patch->>'employee_code'),'') else p.employee_code end,
 department_id=case when patch?'department_id' then nullif(patch->>'department_id','')::uuid else p.department_id end,
 designation=case when patch?'designation' then nullif(btrim(patch->>'designation'),'') else p.designation end,
 manager_id=case when patch?'manager_id' then nullif(patch->>'manager_id','')::uuid else p.manager_id end,
 joining_date=case when patch?'joining_date' then nullif(patch->>'joining_date','')::date else p.joining_date end,
 employment_type=case when patch?'employment_type' then nullif(btrim(patch->>'employment_type'),'') else p.employment_type end
 where p.id=target_profile;
 return target_profile;
exception when unique_violation then raise exception 'This Employee Code is already in use.' using errcode='23505';
end $$;

-- Separate response journal. Rejection never UPDATEs scheduling or finance.
alter table public.doctor_appointments add column clinician_assignment_version bigint not null default 1;
create table public.clinician_appointment_responses(
 request_id uuid primary key, appointment_id uuid not null references public.doctor_appointments(id),
 doctor_id uuid not null references public.outsourced_doctors(id),
 profile_id uuid not null references public.profiles(id), assignment_version bigint not null,
 response text not null check(response in ('accepted','rejected')),
 reason text check(length(reason)<=500), responded_at timestamptz not null default now(),
 appointment_status text not null, created_by uuid not null references public.profiles(id)
);
create index clinician_responses_appointment_idx on public.clinician_appointment_responses(appointment_id,assignment_version,responded_at desc);
alter table public.clinician_appointment_responses enable row level security;
revoke all on public.clinician_appointment_responses from anon,authenticated;
grant select on public.clinician_appointment_responses to authenticated;
grant all on public.clinician_appointment_responses to service_role;
create policy "own clinician response history" on public.clinician_appointment_responses
for select to authenticated using((profile_id=(select auth.uid()) and public.external_clinician_eligible())
or (not public.is_external_profile() and (public.has_permission('appointments.view') or public.has_permission('outsourced_clinicians.manage'))));

create or replace function public.clinician_assignment_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.doctor_id,new.start_at,new.end_at) is distinct from (old.doctor_id,old.start_at,old.end_at) then
 new.clinician_assignment_version:=old.clinician_assignment_version+1;
 else new.clinician_assignment_version:=old.clinician_assignment_version; end if;
 return new;
end $$;
create trigger clinician_assignment_revision before update on public.doctor_appointments
for each row execute function public.clinician_assignment_revision();

create or replace function public.respond_to_clinician_appointment(target_appointment uuid,decision text,request_id uuid,rejection_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare appointment public.doctor_appointments; prior public.clinician_appointment_responses; recipient uuid;
 normalized_reason text:=nullif(btrim(rejection_reason),'');
begin
 if not public.has_permission('clinician.appointments.respond') then raise exception 'Clinician response permission required.' using errcode='42501'; end if;
 if decision not in ('accepted','rejected') or request_id is null or length(normalized_reason)>500 then raise exception 'Invalid clinician response.'; end if;
 select * into appointment from public.doctor_appointments a where a.id=target_appointment for update;
 if not found or appointment.deleted_at is not null or appointment.doctor_id is distinct from public.current_clinician_id()
 or not public.external_patient_access(appointment.patient_id)
 or not exists(select 1 from public.patients p where p.id=appointment.patient_id and p.deleted_at is null and (to_jsonb(p)->>'archived_at') is null and p.status<>'archived') then
 raise exception 'This appointment is unavailable to this clinician.' using errcode='42501'; end if;
 select * into prior from public.clinician_appointment_responses r where r.request_id=respond_to_clinician_appointment.request_id;
 if found then
  if prior.appointment_id<>target_appointment or prior.profile_id<>auth.uid() or prior.response<>decision
  or prior.reason is distinct from normalized_reason then raise exception 'Response request was already used with different details.'; end if;
  return jsonb_build_object('response',prior.response,'appointment_status',appointment.status,'replayed',true);
 end if;
 if appointment.status not in ('scheduled','rescheduled','confirmed')
 or (decision='accepted' and appointment.status not in ('scheduled','rescheduled')) then raise exception 'Appointment is no longer eligible for this response.'; end if;
 insert into public.clinician_appointment_responses(request_id,appointment_id,doctor_id,profile_id,assignment_version,response,reason,appointment_status,created_by)
 values(request_id,appointment.id,appointment.doctor_id,auth.uid(),appointment.clinician_assignment_version,decision,normalized_reason,appointment.status,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'clinician_appointment_response','doctor_appointment',appointment.id,
 jsonb_build_object('status',appointment.status,'assignment_version',appointment.clinician_assignment_version),
 jsonb_build_object('response',decision,'reason',normalized_reason,'request_id',request_id));
 if decision='accepted' then
  update public.doctor_appointments set status='confirmed',updated_by=auth.uid() where id=appointment.id;
  appointment.status:='confirmed';
 else
  for recipient in select p.id from public.profiles p where p.is_employee and p.status::text='active'
  and (public.has_permission('appointments.update_status',p.id) or public.has_permission('outsourced_clinicians.manage',p.id)) loop
   perform public.notify_user(recipient,'Clinician rejected appointment','Rejected — awaiting reassignment.',
   'clinician_appointment_rejected',appointment.id,'/admin/doctor-scheduling?appointment='||appointment.id,auth.uid(),
   'appointments','high','none',true,jsonb_build_object('appointment_id',appointment.id,'response_request_id',request_id));
  end loop;
 end if;
 return jsonb_build_object('response',decision,'appointment_status',appointment.status,'replayed',false);
end $$;

-- Narrow projection: deliberately excludes admin remarks, fees, payouts and
-- employee calendar events. Pending is represented by absence of a response.
create or replace function public.clinician_schedule()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare clinician uuid:=public.current_clinician_id();
begin
 if not public.has_permission('clinician.workspace') or clinician is null then raise exception 'Clinician workspace required.' using errcode='42501'; end if;
 return jsonb_build_object('doctor_id',clinician,'appointments',coalesce((select jsonb_agg(jsonb_build_object(
 'id',a.id,'patient_id',p.id,'patient_name',p.full_name,'patient_number',p.patient_number,'patient_slug',p.slug,
 'start_at',a.start_at,'end_at',a.end_at,'status',a.status,'consultation_type',a.consultation_type,
 'clinician_response',coalesce(r.response,'pending'),'response_reason',r.reason) order by a.start_at)
 from public.doctor_appointments a join public.patients p on p.id=a.patient_id
 left join lateral(select response,reason from public.clinician_appointment_responses response
 where response.appointment_id=a.id and response.doctor_id=clinician and response.assignment_version=a.clinician_assignment_version
 order by responded_at desc,request_id desc limit 1) r on true
 where a.doctor_id=clinician and a.deleted_at is null and public.external_patient_access(p.id)),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(jsonb_build_object('id',id,'day_of_week',day_of_week,'start_time',start_time,'end_time',end_time))
 from public.doctor_weekly_availability where doctor_id=clinician),'[]'::jsonb),
 'blocked_periods',coalesce((select jsonb_agg(jsonb_build_object('blocked_date',blocked_date,'start_time',start_time,'end_time',end_time))
 from public.doctor_blocked_periods where doctor_id=clinician),'[]'::jsonb));
end $$;

create or replace function public.clinician_clients(target_slug text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('clinician.clients.read') then raise exception 'Assigned-client permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'patient_number',p.patient_number,
 'full_name',p.full_name,'phone',p.phone,'date_of_birth',p.date_of_birth,'gender',p.gender,
 'preferred_language',p.preferred_language,'archived_at',to_jsonb(p)->'archived_at') order by p.full_name)
 from public.patients p where public.external_patient_access(p.id) and (target_slug is null or p.slug=target_slug)),'[]'::jsonb);
end $$;

create or replace function public.clinician_sessions(target_patient uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.external_patient_access(target_patient) then raise exception 'Assigned client required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'appointment_at',appointment_at,'session_type',session_type,
 'duration_minutes',duration_minutes,'attendance_status',attendance_status,'follow_up_at',follow_up_at))
 from public.patient_sessions where patient_id=target_patient and assigned_psychologist_id=auth.uid() and deleted_at is null),'[]'::jsonb);
end $$;

alter table public.patient_notes add column doctor_appointment_id uuid references public.doctor_appointments(id);
create index clinician_note_appointment_idx on public.patient_notes(doctor_appointment_id,created_by) where doctor_appointment_id is not null;

create or replace function public.own_clinician_session(target_patient uuid,target_appointment uuid,target_session uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select public.external_patient_access(target_patient)
 and exists(select 1 from public.patients p where p.id=target_patient and p.deleted_at is null and (to_jsonb(p)->>'archived_at') is null and p.status<>'archived')
 and ((target_appointment is not null and exists(select 1 from public.doctor_appointments a
 where a.id=target_appointment and a.patient_id=target_patient and a.doctor_id=public.current_clinician_id() and a.deleted_at is null))
 or (target_appointment is null and target_session is not null))
 and (target_session is null or exists(select 1 from public.patient_sessions s where s.id=target_session
 and s.patient_id=target_patient and s.assigned_psychologist_id=auth.uid() and s.deleted_at is null))
$$;

create policy "external own clinical notes read" on public.patient_notes as restrictive
for select to authenticated using(not public.is_external_profile() or (
 created_by=(select auth.uid()) and note_type='clinical'
 and public.own_clinician_session(patient_id,doctor_appointment_id,related_session_id)));
create policy "external own clinical notes insert" on public.patient_notes as restrictive
for insert to authenticated with check(not public.is_external_profile() or (
 created_by=(select auth.uid()) and note_type='clinical' and public.has_permission('clinician.notes.write')
 and public.own_clinician_session(patient_id,doctor_appointment_id,related_session_id)));
create policy "external own clinical notes update" on public.patient_notes as restrictive
for update to authenticated using(not public.is_external_profile() or (
 created_by=(select auth.uid()) and note_type='clinical' and public.has_permission('clinician.notes.write')
 and public.own_clinician_session(patient_id,doctor_appointment_id,related_session_id)))
with check(not public.is_external_profile() or (created_by=(select auth.uid()) and note_type='clinical'
 and public.own_clinician_session(patient_id,doctor_appointment_id,related_session_id)));
create policy "external notes preserve history" on public.patient_notes as restrictive
for delete to authenticated using(not public.is_external_profile());

create or replace function public.guard_external_clinical_note()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.is_external_profile() then return new; end if;
 if new.created_by is distinct from auth.uid() or new.note_type<>'clinical'
 or not public.has_permission('clinician.notes.write')
 or not public.own_clinician_session(new.patient_id,new.doctor_appointment_id,new.related_session_id) then
 raise exception 'Own assigned session and author required.' using errcode='42501'; end if;
 if tg_op='UPDATE' and (to_jsonb(new)-array['content','updated_by','updated_at'] is distinct from
 to_jsonb(old)-array['content','updated_by','updated_at']) then
 raise exception 'Note ownership and session identity are immutable.' using errcode='42501'; end if;
 if new.updated_by is not null and new.updated_by<>auth.uid() then raise exception 'Invalid note author.' using errcode='42501'; end if;
 return new;
end $$;
create trigger external_note_author_guard before insert or update on public.patient_notes
for each row execute function public.guard_external_clinical_note();

create or replace function public.save_clinician_note(target_patient uuid,target_appointment uuid,note_content text,target_note uuid default null,target_session uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.has_permission('clinician.notes.write') or not public.own_clinician_session(target_patient,target_appointment,target_session)
 then raise exception 'Own assigned session required.' using errcode='42501'; end if;
 if nullif(btrim(note_content),'') is null or length(note_content)>20000 then raise exception 'Provide a note of at most 20,000 characters.'; end if;
 if target_note is null then
 insert into public.patient_notes(patient_id,note_type,content,visibility,created_by,doctor_appointment_id,related_session_id)
 values(target_patient,'clinical',btrim(note_content),'clinical_team',auth.uid(),target_appointment,target_session) returning id into result;
 else
 update public.patient_notes set content=btrim(note_content),updated_by=auth.uid(),updated_at=now()
 where id=target_note and patient_id=target_patient and created_by=auth.uid() and note_type='clinical'
 and doctor_appointment_id is not distinct from target_appointment and related_session_id is not distinct from target_session
 and deleted_at is null returning id into result;
 if result is null then raise exception 'Own session note required.' using errcode='42501'; end if;
 end if;
 return result;
end $$;

create table public.patient_operational_followups(
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 doctor_appointment_id uuid not null references public.doctor_appointments(id),
 related_session_id uuid references public.patient_sessions(id), doctor_id uuid not null references public.outsourced_doctors(id),
 author_profile_id uuid not null references public.profiles(id), follow_up_date date not null,
 operational_remarks text not null check(length(operational_remarks)<=2000),
 status text not null default 'open' check(status in ('open','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id), revision integer not null default 1
);
create index operational_followups_patient_idx on public.patient_operational_followups(patient_id,follow_up_date);
create index operational_followups_author_idx on public.patient_operational_followups(author_profile_id,follow_up_date);
alter table public.patient_operational_followups enable row level security;
revoke all on public.patient_operational_followups from anon,authenticated;
grant select on public.patient_operational_followups to authenticated;
grant all on public.patient_operational_followups to service_role;

create or replace function public.can_read_operational_followup(target_patient uuid,target_author uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when public.is_external_profile() then target_author=auth.uid() and public.external_patient_access(target_patient)
 else public.has_permission('clinical_followups.view_operational')
 and (public.has_permission('patients.view_identity') or public.patient_care_access(target_patient)) end
$$;
create policy "operational followup authorized read" on public.patient_operational_followups
for select to authenticated using(public.can_read_operational_followup(patient_id,author_profile_id));

create or replace function public.save_clinician_followup(target_patient uuid,target_appointment uuid,follow_up_date date,operational_remarks text,
 target_followup uuid default null,target_session uuid default null,next_status text default 'open')
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous jsonb;
begin
 if not public.has_permission('clinician.followups.write') or not public.own_clinician_session(target_patient,target_appointment,target_session)
 then raise exception 'Own assigned session required.' using errcode='42501'; end if;
 if follow_up_date is null or nullif(btrim(operational_remarks),'') is null or length(operational_remarks)>2000
 or next_status not in ('open','completed') then raise exception 'Provide a date, operational remarks and valid status.'; end if;
 if target_followup is null then
 insert into public.patient_operational_followups(patient_id,doctor_appointment_id,related_session_id,doctor_id,author_profile_id,follow_up_date,operational_remarks,updated_by,status)
 values(target_patient,target_appointment,target_session,public.current_clinician_id(),auth.uid(),follow_up_date,btrim(operational_remarks),auth.uid(),next_status)
 returning id into result;
 else
 select to_jsonb(f) into previous from public.patient_operational_followups f where f.id=target_followup
 and f.author_profile_id=auth.uid() and f.patient_id=target_patient and f.doctor_appointment_id=target_appointment
 and f.related_session_id is not distinct from target_session for update;
 if not found then raise exception 'Own operational follow-up required.' using errcode='42501'; end if;
 update public.patient_operational_followups f set follow_up_date=save_clinician_followup.follow_up_date,
 operational_remarks=btrim(save_clinician_followup.operational_remarks),status=next_status,
 updated_by=auth.uid(),updated_at=now(),revision=f.revision+1 where f.id=target_followup returning id into result;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'clinical_operational_followup_saved','patient_operational_followup',result,previous,
 jsonb_build_object('follow_up_date',follow_up_date,'operational_remarks',operational_remarks,'status',next_status));
 return result;
end $$;

create or replace function public.operational_clinical_followups(target_patient uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.has_permission('clinician.followups.write') or public.has_permission('clinical_followups.view_operational'))
 then raise exception 'Operational follow-up permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'patient_id',p.id,'patient_name',p.full_name,
 'patient_number',p.patient_number,'doctor_appointment_id',f.doctor_appointment_id,'author_profile_id',f.author_profile_id,
 'psychologist',d.doctor_name,'follow_up_date',f.follow_up_date,'operational_remarks',f.operational_remarks,
 'status',f.status,'created_at',f.created_at,'updated_at',f.updated_at,'revision',f.revision) order by f.follow_up_date)
 from public.patient_operational_followups f join public.patients p on p.id=f.patient_id
 join public.outsourced_doctors d on d.id=f.doctor_id
 where p.deleted_at is null and (target_patient is null or p.id=target_patient)
 and public.can_read_operational_followup(p.id,f.author_profile_id)),'[]'::jsonb);
end $$;

create policy "external clinical document insert" on public.patient_documents as restrictive
for insert to authenticated with check(not public.is_external_profile() or (
 uploaded_by=(select auth.uid()) and public.patient_document_access(patient_documents.*)
 and public.has_permission('patient_documents.upload')));
create policy "external clinical document update" on public.patient_documents as restrictive
for update to authenticated using(not public.is_external_profile() or (
 uploaded_by=(select auth.uid()) and storage_key like 'pending-%' and public.patient_document_access(patient_documents.*)))
with check(not public.is_external_profile() or (uploaded_by=(select auth.uid()) and
 (public.patient_document_access(patient_documents.*) or (storage_key like 'pending-%' and deleted_by=(select auth.uid()) and public.external_patient_access(patient_id)))));
create policy "external clinical document delete" on public.patient_documents as restrictive
for delete to authenticated using(not public.is_external_profile());

create or replace function public.guard_external_document_finalize()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.is_external_profile() then return new; end if;
 if new.uploaded_by<>auth.uid() or not public.external_patient_access(new.patient_id)
 or not public.has_permission('patient_documents.upload') then raise exception 'Assigned document owner required.' using errcode='42501'; end if;
 if (to_jsonb(new)-array['storage_key','checksum','updated_by','updated_at','deleted_at','deleted_by']) is distinct from
 (to_jsonb(old)-array['storage_key','checksum','updated_by','updated_at','deleted_at','deleted_by']) then
 raise exception 'Document identity and visibility are immutable.' using errcode='42501'; end if;
 if old.storage_key not like 'pending-%' then raise exception 'Only pending uploads can be finalized.' using errcode='42501'; end if;
 if new.storage_key not like 'pending-%' and (new.storage_key not like 'patients/'||new.patient_id||'/documents/'||new.id||'/v1/%'
 or not exists(select 1 from storage.objects o where o.bucket_id='patient-documents' and o.name=new.storage_key and o.owner_id=auth.uid()::text)) then
 raise exception 'The uploaded object does not belong to this document.' using errcode='42501'; end if;
 return new;
end $$;
create trigger external_document_finalize_guard before update on public.patient_documents
for each row execute function public.guard_external_document_finalize();

create or replace function public.clinician_profile(target_doctor uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare clinician uuid:=coalesce(target_doctor,public.current_clinician_id());
begin
 if not (public.has_permission('outsourced_clinicians.manage') or
 (public.has_permission('clinician.profile.edit') and clinician=public.current_clinician_id())) then
 raise exception 'Clinician profile permission required.' using errcode='42501'; end if;
 return (select jsonb_build_object('doctor_id',d.id,'profile_id',p.id,'full_name',coalesce(p.full_name,d.doctor_name),
 'phone',coalesce(p.phone,d.phone),'personal_email',p.personal_email,'avatar_url',p.avatar_url,
 'qualification',d.qualification,'specialization',d.specialization,'professional_information',d.professional_information)
 from public.outsourced_doctors d left join public.profiles p on p.id=d.profile_id
 where d.id=clinician and d.clinician_type='outsourced' and d.archived_at is null);
end $$;

create or replace function public.save_clinician_profile(target_doctor uuid,patch jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare doctor public.outsourced_doctors;
begin
 select * into doctor from public.outsourced_doctors where id=target_doctor for update;
 if not found or doctor.clinician_type<>'outsourced' or doctor.archived_at is not null
 or not (public.has_permission('outsourced_clinicians.manage') or (doctor.id=public.current_clinician_id() and public.has_permission('clinician.profile.edit')))
 then raise exception 'Clinician profile edit permission required.' using errcode='42501'; end if;
 if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) key
 where key<>all(array['full_name','phone','personal_email','avatar_url','qualification','specialization','professional_information'])) then
 raise exception 'Unsupported clinician profile field.' using errcode='22023'; end if;
 if patch?'full_name' and nullif(btrim(patch->>'full_name'),'') is null then raise exception 'Full name is required.'; end if;
 if patch?'avatar_url' and patch->>'avatar_url' is not null and (doctor.profile_id is null or
 patch->>'avatar_url' not like doctor.profile_id::text||'/%' or not exists(select 1 from storage.objects o
 where o.bucket_id='profile-photos' and o.name=patch->>'avatar_url' and o.owner_id=auth.uid()::text)) then
 raise exception 'Choose a permitted uploaded profile photo.' using errcode='42501'; end if;
 if doctor.profile_id is not null then
 update public.profiles p set full_name=case when patch?'full_name' then btrim(patch->>'full_name') else p.full_name end,
 phone=case when patch?'phone' then nullif(btrim(patch->>'phone'),'') else p.phone end,
 personal_email=case when patch?'personal_email' then nullif(btrim(patch->>'personal_email'),'') else p.personal_email end,
 avatar_url=case when patch?'avatar_url' then patch->>'avatar_url' else p.avatar_url end where p.id=doctor.profile_id;
 end if;
 update public.outsourced_doctors set doctor_name=case when patch?'full_name' then btrim(patch->>'full_name') else doctor_name end,
 phone=case when patch?'phone' then coalesce(nullif(btrim(patch->>'phone'),''),'Not provided') else phone end,
 qualification=case when patch?'qualification' then btrim(patch->>'qualification') else qualification end,
 specialization=case when patch?'specialization' then btrim(patch->>'specialization') else specialization end,
 professional_information=case when patch?'professional_information' then btrim(patch->>'professional_information') else professional_information end,
 updated_by=auth.uid() where id=doctor.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'clinician_profile_updated','outsourced_doctor',doctor.id,
 jsonb_build_object('qualification',doctor.qualification,'specialization',doctor.specialization,'professional_information',doctor.professional_information),patch);
 return doctor.id;
end $$;

-- Private request ownership bridges the Auth API and database transaction.
create table public.clinician_provision_requests(
 request_id uuid primary key, doctor_id uuid not null unique references public.outsourced_doctors(id),
 login_email text not null unique check(login_email=lower(btrim(login_email)) and login_email~'^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'),
 payload jsonb not null, created_by uuid not null references public.profiles(id),
 profile_id uuid unique references public.profiles(id), created_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.clinician_provision_requests enable row level security;
revoke all on public.clinician_provision_requests from anon,authenticated;
grant select on public.clinician_provision_requests to authenticated;
grant all on public.clinician_provision_requests to service_role;
create policy "scoped clinician provision request read" on public.clinician_provision_requests
for select to authenticated using(public.has_permission('outsourced_clinicians.manage'));

create or replace function public.reserve_clinician_provision(target_doctor uuid,login_email text,request_id uuid,profile_fields jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doctor public.outsourced_doctors; existing public.clinician_provision_requests;
 normalized_email text:=lower(btrim(login_email));
begin
 if not public.has_permission('outsourced_clinicians.manage') then raise exception 'Scoped outsourced manager required.' using errcode='42501'; end if;
 if request_id is null or normalized_email is null or normalized_email!~'^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'
 then raise exception 'Approved login email and request ID required.'; end if;
 if jsonb_typeof(profile_fields)<>'object' or exists(select 1 from jsonb_object_keys(profile_fields) key where key<>all(array[
 'full_name','phone','personal_email','qualification','specialization','professional_information']))
 or nullif(btrim(profile_fields->>'full_name'),'') is null then raise exception 'Provide approved profile fields.'; end if;
 select * into doctor from public.outsourced_doctors where id=target_doctor for update;
 if not found or doctor.clinician_type<>'outsourced' or doctor.archived_at is not null or doctor.status<>'active'
 then raise exception 'Active existing outsourced clinician required.' using errcode='42501'; end if;
 select * into existing from public.clinician_provision_requests r where r.request_id=reserve_clinician_provision.request_id for update;
 if found then
  if existing.doctor_id<>doctor.id or existing.login_email<>normalized_email or existing.payload<>profile_fields
  or (doctor.profile_id is not null and doctor.profile_id is distinct from existing.profile_id) then
  raise exception 'Provisioning request ownership or details conflict.' using errcode='42501'; end if;
  return to_jsonb(existing);
 end if;
 if doctor.profile_id is not null or exists(select 1 from public.profiles where lower(email)=normalized_email)
 then raise exception 'An unrelated profile already owns this clinician or login email.' using errcode='42501'; end if;
 insert into public.clinician_provision_requests(request_id,doctor_id,login_email,payload,created_by)
 values(request_id,doctor.id,normalized_email,profile_fields,auth.uid()) returning * into existing;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
 values(auth.uid(),'external_clinician_provision_reserved','outsourced_doctor',doctor.id,
 jsonb_build_object('request_id',request_id,'login_email',normalized_email));
 return to_jsonb(existing);
exception when unique_violation then raise exception 'This clinician or login email has another provisioning reservation.' using errcode='23505';
end $$;

create or replace function public.complete_clinician_provision(request_id uuid,auth_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare reservation public.clinician_provision_requests; doctor public.outsourced_doctors; identity auth.users;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
 raise exception 'Server service role required.' using errcode='42501'; end if;
 select * into reservation from public.clinician_provision_requests r where r.request_id=complete_clinician_provision.request_id;
 if not found then raise exception 'Provisioning reservation required.'; end if;
 select * into doctor from public.outsourced_doctors where id=reservation.doctor_id for update;
 select * into reservation from public.clinician_provision_requests r where r.request_id=complete_clinician_provision.request_id for update;
 select * into identity from auth.users where id=auth_user_id;
 if not found or identity.email_confirmed_at is null or lower(identity.email)<>reservation.login_email
 or identity.raw_app_meta_data->>'clinician_provision_request_id' is distinct from request_id::text
 or identity.raw_app_meta_data->>'existing_clinician_id' is distinct from reservation.doctor_id::text then
 raise exception 'Auth identity does not belong to this provisioning request.' using errcode='42501'; end if;
 if reservation.completed_at is not null then
  if reservation.profile_id is distinct from auth_user_id or doctor.profile_id is distinct from auth_user_id then
  raise exception 'Completed clinician linkage conflicts.' using errcode='42501'; end if;
  return reservation.profile_id;
 end if;
 if doctor.clinician_type<>'outsourced' or doctor.status<>'active' or doctor.archived_at is not null
 or doctor.profile_id is not null or exists(select 1 from public.profiles where id=auth_user_id)
 or not public.has_permission('outsourced_clinicians.manage',reservation.created_by) then
 raise exception 'Clinician reservation is no longer eligible.' using errcode='42501'; end if;
 insert into public.profiles(id,full_name,email,phone,personal_email,role,status,designation,is_employee,employee_code,
 workforce_visible,login_enabled,onboarding_required)
 values(auth_user_id,btrim(reservation.payload->>'full_name'),reservation.login_email,
 nullif(btrim(reservation.payload->>'phone'),''),nullif(btrim(reservation.payload->>'personal_email'),''),
 'staff','active','Outsourced psychologist',false,null,false,true,true);
 update public.outsourced_doctors set profile_id=auth_user_id,self_service_enabled=true,
 doctor_name=btrim(reservation.payload->>'full_name'),email=reservation.login_email,
 phone=coalesce(nullif(btrim(reservation.payload->>'phone'),''),phone),
 qualification=coalesce(nullif(btrim(reservation.payload->>'qualification'),''),qualification),
 specialization=coalesce(nullif(btrim(reservation.payload->>'specialization'),''),specialization),
 professional_information=reservation.payload->>'professional_information' where id=doctor.id;
 insert into public.user_permission_grants(profile_id,permission_id,granted_by,reason)
 select auth_user_id,id,reservation.created_by,'External clinician provisioning request '||request_id
 from public.permissions where code=any(array['clinician.workspace','clinician.clients.read','clinician.appointments.respond',
 'clinician.notes.write','clinician.followups.write','clinician.profile.edit','clinician.schedule.view_own','clinician.appointments.view_own',
 'patient_documents.view','patient_documents.upload','patient_documents.download','clinical_notes.view','clinical_notes.create','clinical_notes.edit','chat.use']);
 update public.clinician_provision_requests r set profile_id=auth_user_id,completed_at=now()
 where r.request_id=complete_clinician_provision.request_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
 values(reservation.created_by,'external_clinician_provision_completed','outsourced_doctor',doctor.id,
 jsonb_build_object('request_id',request_id,'profile_id',auth_user_id,'is_employee',false));
 return auth_user_id;
end $$;

-- All chat membership-dependent policies and attachment/receipt RPCs reuse
-- is_chat_member. External participants are eligible only in two-person chats.
create or replace function public.chat_participant_eligible(subject_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=subject_id
 and p.login_enabled and not p.onboarding_required
 and public.has_permission('chat.use',p.id)
 and case when p.is_employee then p.status::text in ('active','intern','probation')
 else public.external_clinician_eligible(p.id) end)
$$;

create or replace function public.is_chat_member(conversation uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.chat_participant_eligible(auth.uid()) and exists(
 select 1 from public.chat_members m join public.chat_conversations c on c.id=m.conversation_id
 where m.conversation_id=conversation and m.profile_id=auth.uid() and c.archived_at is null
 and (not exists(select 1 from public.chat_members cm where cm.conversation_id=c.id and public.is_external_profile(cm.profile_id))
 or (c.conversation_type='personal'
 and (select count(*) from public.chat_members cm where cm.conversation_id=c.id)=2
 and not exists(select 1 from public.chat_members cm where cm.conversation_id=c.id and not public.chat_participant_eligible(cm.profile_id)))))
$$;

create or replace function public.chat_recipient_search(search_text text default '')
returns table(id uuid,full_name text,designation text,avatar_url text,department_name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.designation,p.avatar_url,d.name
 from public.profiles p left join public.departments d on d.id=p.department_id
 where public.chat_participant_eligible(auth.uid()) and p.id<>auth.uid()
 and public.chat_participant_eligible(p.id) and p.full_name ilike '%'||btrim(coalesce(search_text,''))||'%'
 order by p.full_name limit 30
$$;

create or replace function public.chat_display_profiles(target_profiles uuid[])
returns table(id uuid,full_name text,designation text,avatar_url text,status text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.designation,p.avatar_url,p.status::text from public.profiles p
 where public.chat_participant_eligible(auth.uid()) and p.id=any(target_profiles[1:100])
 and public.chat_participant_eligible(p.id) and (p.id=auth.uid() or exists(
 select 1 from public.chat_members m where m.profile_id=p.id and public.is_chat_member(m.conversation_id)))
$$;

create or replace function public.assert_chat_mentions(target_conversation uuid,target_profiles uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_chat_member(target_conversation) then raise exception 'Conversation access required.' using errcode='42501'; end if;
 if exists(select 1 from unnest(target_profiles) mentioned_id where not exists(
 select 1 from public.chat_members m where m.conversation_id=target_conversation and m.profile_id=mentioned_id
 and public.chat_participant_eligible(m.profile_id))) then raise exception 'Mentions must be eligible participants.'; end if;
end $$;

-- Preserve the environment's legacy channel compatibility and pair lock.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.create_or_get_direct_chat(uuid)'::regprocedure);
 definition:=regexp_replace(definition,
 'if not exists\([\s\S]*?Only current chat-enabled employees can use chat'';[\s\S]*?end if;',
 'if not public.chat_participant_eligible(auth.uid()) or not public.chat_participant_eligible(other_profile) then raise exception ''Only eligible chat participants can use chat''; end if;','i');
 if position('public.chat_participant_eligible(other_profile)' in definition)=0 then
 raise exception 'Direct chat source differs: review before migrating.'; end if;
 execute definition;
end $$;

create or replace function public.can_view_clinician_photo(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.avatar_url=object_name
 and ((p.id=auth.uid() and public.has_permission('clinician.profile.edit'))
 or (public.has_permission('outsourced_clinicians.manage') and not p.is_employee)
 or (public.chat_participant_eligible(auth.uid()) and public.chat_participant_eligible(p.id))))
$$;
create policy "clinician and direct chat profile photos" on storage.objects for select to authenticated
using(bucket_id='profile-photos' and public.can_view_clinician_photo(name));
create policy "scoped clinician manager photo upload" on storage.objects for insert to authenticated
with check(bucket_id='profile-photos' and public.has_permission('outsourced_clinicians.manage')
and exists(select 1 from public.outsourced_doctors d where d.profile_id::text=(storage.foldername(name))[1]
and d.clinician_type='outsourced' and d.archived_at is null));

-- Definer lifecycle RPCs bypass table RLS. Keep their original behaviour for
-- staff/interns but make outsourced changes require the new target scope.
create or replace function public.guard_outsourced_registry_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 if old.clinician_type='outsourced' and not public.has_permission('outsourced_clinicians.manage')
 and not (old.profile_id=auth.uid() and public.has_permission('clinician.profile.edit')
 and to_jsonb(new)-array['doctor_name','phone','qualification','specialization','professional_information','updated_at']
 is not distinct from to_jsonb(old)-array['doctor_name','phone','qualification','specialization','professional_information','updated_at']) then
 raise exception 'Outsourced manager permission required.' using errcode='42501'; end if;
 if (new.clinician_type,new.profile_id,new.self_service_enabled,new.email) is distinct from
 (old.clinician_type,old.profile_id,old.self_service_enabled,old.email)
 and (old.clinician_type='outsourced' or new.clinician_type='outsourced') then
 raise exception 'Outsourced login linkage is server-provisioned and immutable.' using errcode='42501'; end if;
 return new;
end $$;
create trigger outsourced_registry_identity_guard before update on public.outsourced_doctors
for each row execute function public.guard_outsourced_registry_identity();

create or replace function public.outsourced_clinician_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('outsourced_clinicians.manage') then raise exception 'Outsourced manager permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'doctor_name',d.doctor_name,'profile_id',d.profile_id,
 'availability',coalesce((select jsonb_agg(jsonb_build_object('day_of_week',a.day_of_week,'start_time',a.start_time,'end_time',a.end_time))
 from public.doctor_weekly_availability a where a.doctor_id=d.id),'[]'::jsonb)) order by d.doctor_name)
 from public.outsourced_doctors d where d.clinician_type='outsourced' and d.status='active' and d.archived_at is null),'[]'::jsonb);
end $$;
revoke all on function public.outsourced_clinician_directory() from public,anon;
grant execute on function public.outsourced_clinician_directory() to authenticated,service_role;

create or replace function public.external_clinical_upload_object(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select case when object_name ~ '^patients/[0-9a-f-]{36}/documents/[0-9a-f-]{36}/v1/[^/]+$'
 then exists(select 1 from public.patient_documents d where d.id::text=split_part(object_name,'/',4)
 and d.patient_id::text=split_part(object_name,'/',2) and d.uploaded_by=auth.uid()
 and d.storage_key like 'pending-%' and public.patient_document_access(d)
 and public.has_permission('patient_documents.upload')) else false end
$$;
revoke all on function public.external_clinical_upload_object(text) from public,anon;
grant execute on function public.external_clinical_upload_object(text) to authenticated,service_role;
create policy "external upload object boundary" on storage.objects as restrictive for insert to authenticated
with check(not public.is_external_profile() or (bucket_id=any(array['profile-photos','chat-attachments','patient-documents'])
and (bucket_id<>'patient-documents' or (owner_id=auth.uid()::text and public.external_clinical_upload_object(name)))));
create policy "external pending clinical upload" on storage.objects for insert to authenticated
with check(bucket_id='patient-documents' and owner_id=auth.uid()::text and public.is_external_profile()
and public.external_clinical_upload_object(name));

create or replace function public.record_clinician_document_download(target_document uuid)
returns void language plpgsql security definer set search_path='' as $$
declare doc public.patient_documents;
begin
 select * into doc from public.patient_documents where id=target_document;
 if not found or not public.is_external_profile() or not public.patient_document_access(doc)
 or not public.has_permission('patient_documents.download') then raise exception 'Document access denied.' using errcode='42501'; end if;
 insert into public.patient_activity_logs(patient_id,document_id,action,entity_type,entity_id,performed_by,metadata)
 values(doc.patient_id,doc.id,'document_downloaded','patient_document',doc.id,auth.uid(),'{}'::jsonb);
end $$;
revoke all on function public.record_clinician_document_download(uuid) from public,anon;
grant execute on function public.record_clinician_document_download(uuid) to authenticated,service_role;

-- Function execution is explicit; browser clients never finish Auth linkage.
do $$
declare item record;
begin
 for item in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['is_external_profile','active_direct_permission','external_clinician_eligible','has_permission','current_clinician_id','can_manage_clinician','external_patient_access','patient_care_access','patient_document_access','can_edit_employee_identity','profile_can_operationally_edit','guard_clinician_profile_fields','employee_identity_code_activity','employee_identity_directory','employee_identity_options','edit_employee_identity','clinician_assignment_revision','respond_to_clinician_appointment','clinician_schedule','clinician_clients','clinician_sessions','own_clinician_session','guard_external_clinical_note','save_clinician_note','can_read_operational_followup','save_clinician_followup','operational_clinical_followups','guard_external_document_finalize','clinician_profile','save_clinician_profile','reserve_clinician_provision','complete_clinician_provision','chat_participant_eligible','is_chat_member','chat_recipient_search','chat_display_profiles','assert_chat_mentions','can_view_clinician_photo','guard_outsourced_registry_identity']) loop
 execute format('revoke all on function %s from public,anon,authenticated',item.signature);
 if item.proname<>all(array['complete_clinician_provision','guard_clinician_profile_fields','employee_identity_code_activity','clinician_assignment_revision','guard_external_clinical_note','guard_external_document_finalize','guard_outsourced_registry_identity']) then
 execute format('grant execute on function %s to authenticated',item.signature); end if;
 execute format('grant execute on function %s to service_role',item.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
