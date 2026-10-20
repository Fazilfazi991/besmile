-- RELEASE-ONLY CANDIDATE. Not an automatically applied migration.
-- Requires the read-only Production preflight, review and release approval.
-- Never run against QA identities or infer approval from this file.
begin;
do $$
begin
  if (select count(*) from public.profiles p join auth.users u on u.id=p.id
    where p.is_employee and p.workforce_visible and p.login_enabled
      and p.removed_at is null and not p.onboarding_required
      and p.status::text in ('active','intern','probation')
      and p.designation = 'Sales Coordinator'
      and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())
      and ((p.id='04f7ade2-99ee-43d1-b4c0-de2cd168fc39'
        and p.full_name='Fatima Suhara' and lower(p.email)='salesheadbsmile@gmail.com'
        and lower(u.email)='salesheadbsmile@gmail.com')
      or (p.id='28516281-ec1c-4902-a786-346e1a51f001'
        and p.full_name='Fatima KR' and lower(p.email)='marketingcobsmile@gmail.com'
        and lower(u.email)='marketingcobsmile@gmail.com'))) <> 2 then
    raise exception 'Both approved Sales Coordinator identities must pass current Production verification.';
  end if;
  if (select count(*) from public.permissions where code in
      ('doctor_scheduling.view','doctor_scheduling.create_appointments')) <> 2 then
    raise exception 'Required scheduling permissions are missing.';
  end if;
end $$;

insert into public.user_permission_grants(profile_id,permission_id,reason)
select target.id, permission.id, 'Approved urgent operations October 20 appointment booking only'
from (values ('04f7ade2-99ee-43d1-b4c0-de2cd168fc39'::uuid),
  ('28516281-ec1c-4902-a786-346e1a51f001'::uuid)) target(id)
cross join public.permissions permission
where permission.code in ('doctor_scheduling.view','doctor_scheduling.create_appointments')
  and not exists (select 1 from public.user_permission_grants g
    where g.profile_id=target.id and g.permission_id=permission.id and g.revoked_at is null
      and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()));
commit;
