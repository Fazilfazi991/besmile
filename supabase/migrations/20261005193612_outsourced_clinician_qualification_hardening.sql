-- QA qualification corrections; no production identities or data changes.
create or replace function public.employee_identity_code_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb;
begin
 if not new.is_employee then return new; end if;
 changes:=jsonb_strip_nulls(jsonb_build_object(
 'employee_code',case when new.employee_code is distinct from old.employee_code then jsonb_build_object('from',old.employee_code,'to',new.employee_code) end,
 'gender',case when new.gender is distinct from old.gender then jsonb_build_object('from',old.gender,'to',new.gender) end));
 if changes<>'{}'::jsonb then insert into public.employee_activity_logs(profile_id,actor_id,action,changes)
 values(new.id,auth.uid(),'employee_updated',changes); end if;
 return new;
end $$;
create or replace function public.guard_outsourced_registry_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 if old.clinician_type='outsourced' and not public.has_permission('outsourced_clinicians.manage')
 and not (old.profile_id=auth.uid() and public.has_permission('clinician.profile.edit')
 and to_jsonb(new)-array['doctor_name','phone','qualification','specialization','professional_information','updated_by','updated_at']
 is not distinct from to_jsonb(old)-array['doctor_name','phone','qualification','specialization','professional_information','updated_by','updated_at']) then
 raise exception 'Outsourced manager permission required.' using errcode='42501'; end if;
 if (new.clinician_type,new.profile_id,new.self_service_enabled,new.email) is distinct from
 (old.clinician_type,old.profile_id,old.self_service_enabled,old.email)
 and (old.clinician_type='outsourced' or new.clinician_type='outsourced') then
 raise exception 'Outsourced login linkage is server-provisioned and immutable.' using errcode='42501'; end if;
 return new;
end $$;
create or replace function public.operational_clinical_followups(target_patient uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.has_permission('clinician.followups.write') or public.has_permission('clinical_followups.view_operational'))
 then raise exception 'Operational follow-up permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'patient_id',p.id,'patient_name',p.full_name,
 'patient_number',p.patient_number,'doctor_appointment_id',f.doctor_appointment_id,'related_session_id',f.related_session_id,'author_profile_id',f.author_profile_id,
 'psychologist',d.doctor_name,'follow_up_date',f.follow_up_date,'operational_remarks',f.operational_remarks,
 'status',f.status,'created_at',f.created_at,'updated_at',f.updated_at,'revision',f.revision) order by f.follow_up_date)
 from public.patient_operational_followups f join public.patients p on p.id=f.patient_id
 join public.outsourced_doctors d on d.id=f.doctor_id
 where p.deleted_at is null and (target_patient is null or p.id=target_patient)
 and public.can_read_operational_followup(p.id,f.author_profile_id)),'[]'::jsonb);
end $$;

create or replace function public.employee_group_recipient_search(search_text text default '')
returns table(id uuid,full_name text,designation text,avatar_url text,department_name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.designation,p.avatar_url,d.name
 from public.profiles p left join public.departments d on d.id=p.department_id
 where public.chat_participant_eligible(auth.uid()) and not public.is_external_profile()
 and p.id<>auth.uid() and p.is_employee and p.role<>'director' and public.chat_participant_eligible(p.id)
 and p.full_name ilike '%'||btrim(coalesce(search_text,''))||'%' order by p.full_name limit 30
$$;
revoke all on function public.employee_group_recipient_search(text) from public,anon;
grant execute on function public.employee_group_recipient_search(text) to authenticated,service_role;
create index clinician_responses_doctor_idx on public.clinician_appointment_responses(doctor_id);
create index clinician_responses_profile_idx on public.clinician_appointment_responses(profile_id);
create index clinician_responses_creator_idx on public.clinician_appointment_responses(created_by);
create index operational_followups_appointment_idx on public.patient_operational_followups(doctor_appointment_id);
create index operational_followups_session_idx on public.patient_operational_followups(related_session_id);
create index operational_followups_doctor_idx on public.patient_operational_followups(doctor_id);
create index operational_followups_updater_idx on public.patient_operational_followups(updated_by);
create index clinician_provisions_creator_idx on public.clinician_provision_requests(created_by);
notify pgrst,'reload schema';

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
 if not old.is_employee and new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
 and (new.avatar_url not like new.id::text||'/%' or not exists(select 1 from storage.objects o
 where o.bucket_id='profile-photos' and o.name=new.avatar_url and o.owner_id=auth.uid()::text)) then
 raise exception 'Choose your own permitted uploaded profile photo.' using errcode='42501'; end if;
 return new;
end $$;

alter table public.clinician_appointment_responses add column response_sequence bigint generated always as identity;
create or replace function public.clinician_schedule()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare clinician uuid:=public.current_clinician_id();
begin
 if not public.has_permission('clinician.workspace') or clinician is null then raise exception 'Clinician workspace required.' using errcode='42501'; end if;
 return jsonb_build_object('doctor_id',clinician,'appointments',coalesce((select jsonb_agg(jsonb_build_object(
 'id',a.id,'patient_id',p.id,'patient_name',p.full_name,'patient_number',p.patient_number,'patient_slug',p.slug,
 'start_at',a.start_at,'end_at',a.end_at,'status',a.status,'consultation_type',a.consultation_type,
 'assignment_version',a.clinician_assignment_version,'clinician_response',coalesce(r.response,'pending'),'response_reason',r.reason) order by a.start_at)
 from public.doctor_appointments a join public.patients p on p.id=a.patient_id
 left join lateral(select response,reason from public.clinician_appointment_responses response
 where response.appointment_id=a.id and response.doctor_id=clinician and response.assignment_version=a.clinician_assignment_version
 order by response_sequence desc limit 1) r on true
 where a.doctor_id=clinician and a.deleted_at is null and public.external_patient_access(p.id)),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(jsonb_build_object('id',id,'day_of_week',day_of_week,'start_time',start_time,'end_time',end_time))
 from public.doctor_weekly_availability where doctor_id=clinician),'[]'::jsonb),
 'blocked_periods',coalesce((select jsonb_agg(jsonb_build_object('blocked_date',blocked_date,'start_time',start_time,'end_time',end_time))
 from public.doctor_blocked_periods where doctor_id=clinician),'[]'::jsonb));
end $$;
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
  or prior.assignment_version<>appointment.clinician_assignment_version or prior.reason is distinct from normalized_reason then raise exception 'Response request was already used with different details.'; end if;
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

create or replace function public.current_clinician_id()
returns uuid language sql stable security definer set search_path='' as $$
 select d.id from public.outsourced_doctors d join public.profiles p on p.id=d.profile_id
 where d.profile_id=auth.uid() and d.self_service_enabled and d.archived_at is null
 and p.login_enabled and not p.onboarding_required
 and ((p.is_employee and p.status::text in ('active','intern','probation')) or public.external_clinician_eligible(p.id)) limit 1
$$;
create or replace function public.ensure_my_all_employees_chat()
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication is required'; end if;
 if public.is_external_profile() then return null; end if;
 return public.ensure_all_employees_chat_member(auth.uid());
end $$;
do $$
declare item record; definition text;
begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('manage_group_chat_member','archive_group_chat') loop
 definition:=pg_get_functiondef(item.oid);
 definition:=regexp_replace(definition,'\mbegin\M',
 'begin if public.is_external_profile() then raise exception ''External clinicians use direct chat only.'' using errcode=''42501''; end if;','i');
 execute definition;
 end loop;
end $$;
notify pgrst,'reload schema';
