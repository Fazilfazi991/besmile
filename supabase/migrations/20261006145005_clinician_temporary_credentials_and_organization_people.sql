-- Forward-only QA-first upgrade. No existing credentials, grants, profiles,
-- availability, appointments or patients are mutated by this migration.

-- Preserve the installed role/bundle policy; change only employee eligibility.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('clinician_private.internal_has_permission(text,uuid)'::regprocedure);
 if position('subject.status = ''active''' in definition)=0 then
  raise exception 'Unexpected internal permission definition; review before applying';
 end if;
 definition := replace(definition,'subject.status = ''active''',
  'subject.status::text in (''active'',''intern'',''probation'') and subject.is_employee and subject.login_enabled and subject.removed_at is null');
 execute definition;
end $$;

create or replace function public.active_direct_permission(permission_code text,subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p
 join public.user_permission_grants g on g.profile_id=p.id
 join public.permissions permission on permission.id=g.permission_id
 where p.id=subject_id and p.login_enabled and p.removed_at is null
 and ((p.is_employee and p.status::text in ('active','intern','probation'))
      or (not p.is_employee and p.status::text='active'))
 and not p.onboarding_required and permission.code=permission_code
 and g.revoked_at is null and g.starts_at<=now()
 and (g.expires_at is null or g.expires_at>now()))
$$;

-- Internal-only projection remains safe for all employee/HR manager selectors.
create or replace function public.organization_directory()
returns table(id uuid,full_name text,designation text,manager_id uuid,department_id uuid,department_name text,avatar_url text,status text,can_edit boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.designation,p.manager_id,p.department_id,d.name,p.avatar_url,p.status::text,
 (public.has_permission('organization_chart.manage') or public.has_permission('employees.manage') or
 (public.has_permission('employees.edit') and not public.profile_role_is_protected(p.role::text)))
 from public.profiles p join auth.users identity on identity.id=p.id
 left join public.departments d on d.id=p.department_id
 where exists(select 1 from public.profiles viewer join auth.users viewer_identity on viewer_identity.id=viewer.id
 where viewer.id=(select auth.uid()) and viewer.is_employee
 and viewer.status::text in ('active','intern','probation') and viewer.login_enabled
 and viewer.removed_at is null and not viewer.onboarding_required
 and viewer_identity.email_confirmed_at is not null
 and (viewer_identity.banned_until is null or viewer_identity.banned_until<=now()))
 and p.status::text in ('active','intern','probation') and p.removed_at is null and p.login_enabled
 and not p.onboarding_required and identity.email_confirmed_at is not null
 and (identity.banned_until is null or identity.banned_until<=now())
 and ((p.is_employee and p.workforce_visible) or p.role::text in ('chairman','director'))
 order by p.full_name,p.id
$$;

-- Pending first-login clinicians are directory entries only. This RPC does not
-- grant workspace access; external_clinician_eligible still enforces onboarding.
create or replace function public.organization_people_directory()
returns table(id uuid,full_name text,designation text,manager_id uuid,department_id uuid,department_name text,avatar_url text,status text,can_edit boolean,person_type text,clinician_id uuid,can_manage_clinician boolean)
language sql stable security definer set search_path='' as $$
 select e.*, 'employee'::text, null::uuid, false from public.organization_directory() e
 union all
 select p.id,p.full_name,'Online Psychologist'::text,null::uuid,null::uuid,null::text,p.avatar_url,p.status::text,
 false,'outsourced_clinician'::text,d.id,public.has_permission('outsourced_clinicians.manage')
 from public.profiles p join auth.users identity on identity.id=p.id
 join public.outsourced_doctors d on d.profile_id=p.id
 where exists(select 1 from public.organization_directory())
 and not p.is_employee and p.status::text='active' and p.login_enabled and p.removed_at is null
 and identity.email_confirmed_at is not null
 and lower(identity.email)=lower(p.email) and lower(d.email)=lower(p.email)
 and (identity.banned_until is null or identity.banned_until<=now())
 and d.clinician_type='outsourced' and d.status='active' and d.archived_at is null and d.self_service_enabled
$$;
revoke all on function public.organization_people_directory() from public,anon;
grant execute on function public.organization_people_directory() to authenticated;
drop policy if exists "organization current profile photo" on storage.objects;
create policy "organization current profile photo" on storage.objects for select to authenticated
using(bucket_id='profile-photos' and exists(select 1 from public.organization_people_directory() person where person.avatar_url=storage.objects.name));

-- The narrow employee RPC never accepts external targets or managers.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.update_organization_employee(uuid,uuid,uuid,text)'::regprocedure);
 definition := replace(definition,'status=''active''','status::text in (''active'',''intern'',''probation'')');
 definition := replace(definition,'where id=employee_id and','where id=employee_id and is_employee and login_enabled and');
 definition := replace(definition,'update public.profiles set manager_id=',
  'if reporting_manager_id is not null and not exists(select 1 from public.profiles p where p.id=reporting_manager_id and p.is_employee and p.login_enabled and p.removed_at is null and p.status::text in (''active'',''intern'',''probation'')) then raise exception ''Choose an eligible internal reporting manager''; end if; update public.profiles set manager_id=');
 execute definition;
 definition := pg_get_functiondef('public.prevent_reporting_cycle()'::regprocedure);
 definition := replace(definition,'id=new.manager_id and status=''active''',
  'id=new.manager_id and is_employee and login_enabled and status::text in (''active'',''intern'',''probation'')');
 execute definition;
 -- Omitted professional text must survive provisioning.
 definition := pg_get_functiondef('public.complete_clinician_provision(uuid,uuid)'::regprocedure);
 if position('professional_information=reservation.payload->>''professional_information''' in definition)=0 then
  raise exception 'Unexpected provisioning definition; review before applying';
 end if;
 definition := replace(definition,'professional_information=reservation.payload->>''professional_information''',
  'professional_information=coalesce(reservation.payload->>''professional_information'',professional_information)');
 execute definition;
end $$;

create table clinician_private.temporary_credential_requests(
 request_id uuid primary key,
 doctor_id uuid not null references public.outsourced_doctors(id),
 profile_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id),
 login_email text not null,
 status text not null default 'pending' check(status in ('pending','completed','failed')),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table clinician_private.temporary_credential_requests enable row level security;
revoke all on clinician_private.temporary_credential_requests from public,anon,authenticated;
create unique index temporary_credential_one_pending on clinician_private.temporary_credential_requests(doctor_id) where status='pending';

create or replace function public.clinician_temporary_credential_status(target_doctor uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare doctor public.outsourced_doctors; profile public.profiles; identity auth.users;
begin
 if not public.has_permission('outsourced_clinicians.manage') then raise exception 'Outsourced manager permission required' using errcode='42501'; end if;
 select * into doctor from public.outsourced_doctors where id=target_doctor;
 select * into profile from public.profiles where id=doctor.profile_id;
 select * into identity from auth.users where id=profile.id;
 if doctor.id is null or doctor.clinician_type<>'outsourced' or doctor.status<>'active' or doctor.archived_at is not null
 or not doctor.self_service_enabled or profile.id is null or profile.is_employee or profile.status::text<>'active'
 or not profile.login_enabled or profile.removed_at is not null or identity.id is null
 or identity.email_confirmed_at is null or (identity.banned_until is not null and identity.banned_until>now())
 or lower(identity.email) is distinct from lower(profile.email) or lower(doctor.email) is distinct from lower(profile.email)
 or identity.raw_app_meta_data->>'existing_clinician_id' is distinct from doctor.id::text then return 'ineligible'; end if;
 if not profile.onboarding_required then return 'onboarding_complete'; end if;
 if identity.last_sign_in_at is not null then return 'manual_review'; end if;
 if exists(select 1 from clinician_private.temporary_credential_requests r where r.doctor_id=target_doctor and r.status='pending') then return 'manual_review'; end if;
 return 'eligible';
end $$;

create or replace function public.reserve_clinician_temporary_credential(target_doctor uuid,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing clinician_private.temporary_credential_requests; doctor public.outsourced_doctors;
begin
 if not public.has_permission('outsourced_clinicians.manage') then raise exception 'Outsourced manager permission required' using errcode='42501'; end if;
 if target_doctor is null or request_id is null then raise exception 'Existing clinician and request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_doctor::text,913047));
 select * into existing from clinician_private.temporary_credential_requests r where r.request_id=reserve_clinician_temporary_credential.request_id;
 if found then
  if existing.actor_id is distinct from auth.uid() or existing.doctor_id is distinct from target_doctor then raise exception 'Credential request binding conflict' using errcode='42501'; end if;
  return jsonb_build_object('status',existing.status,'profile_id',existing.profile_id,'newly_reserved',false);
 end if;
 if public.clinician_temporary_credential_status(target_doctor)<>'eligible' then raise exception 'Account is not eligible. Completed or previously signed-in accounts require manual review.' using errcode='42501'; end if;
 select * into doctor from public.outsourced_doctors where id=target_doctor for update;
 insert into clinician_private.temporary_credential_requests(request_id,doctor_id,profile_id,actor_id,login_email)
 values(request_id,doctor.id,doctor.profile_id,auth.uid(),lower(doctor.email));
 return jsonb_build_object('status','pending','profile_id',doctor.profile_id,'login_email',lower(doctor.email),'newly_reserved',true);
end $$;

-- Recheck profile, registry and manager scope immediately before the Auth API
-- write; a reservation is not a durable authorization grant.
create or replace function public.validate_clinician_temporary_credential(request_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server service role required' using errcode='42501'; end if;
 return exists(select 1 from clinician_private.temporary_credential_requests r
 join public.profiles p on p.id=r.profile_id join auth.users identity on identity.id=p.id
 join public.outsourced_doctors d on d.id=r.doctor_id and d.profile_id=p.id
 where r.request_id=validate_clinician_temporary_credential.request_id and r.status='pending'
 and public.has_permission('outsourced_clinicians.manage',r.actor_id)
 and not p.is_employee and p.status::text='active' and p.login_enabled and p.removed_at is null and p.onboarding_required
 and lower(p.email)=r.login_email and lower(identity.email)=r.login_email and lower(d.email)=r.login_email
 and identity.email_confirmed_at is not null and identity.last_sign_in_at is null
 and (identity.banned_until is null or identity.banned_until<=now())
 and identity.raw_app_meta_data->>'existing_clinician_id'=d.id::text
 and d.clinician_type='outsourced' and d.status='active' and d.archived_at is null and d.self_service_enabled);
end $$;
revoke all on function public.validate_clinician_temporary_credential(uuid) from public,anon,authenticated;
grant execute on function public.validate_clinician_temporary_credential(uuid) to service_role;

create or replace function public.finish_clinician_temporary_credential(request_id uuid,succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
declare reservation clinician_private.temporary_credential_requests;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server service role required' using errcode='42501'; end if;
 select * into reservation from clinician_private.temporary_credential_requests r where r.request_id=finish_clinician_temporary_credential.request_id for update;
 if not found then raise exception 'Credential reservation required'; end if;
 if reservation.status='completed' and succeeded then return; end if;
 if reservation.status<>'pending' then raise exception 'Credential reservation is not pending'; end if;
 update clinician_private.temporary_credential_requests r set status=case when succeeded then 'completed' else 'failed' end,completed_at=now()
 where r.request_id=finish_clinician_temporary_credential.request_id;
 if succeeded then
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(reservation.actor_id,'temporary_credential_regenerated','auth_user',reservation.profile_id,jsonb_build_object('clinician_id',reservation.doctor_id));
 end if;
end $$;
revoke all on function public.clinician_temporary_credential_status(uuid) from public,anon;
revoke all on function public.reserve_clinician_temporary_credential(uuid,uuid) from public,anon;
revoke all on function public.finish_clinician_temporary_credential(uuid,boolean) from public,anon,authenticated;
grant execute on function public.clinician_temporary_credential_status(uuid) to authenticated;
grant execute on function public.reserve_clinician_temporary_credential(uuid,uuid) to authenticated;
grant execute on function public.finish_clinician_temporary_credential(uuid,boolean) to service_role;
notify pgrst,'reload schema';
