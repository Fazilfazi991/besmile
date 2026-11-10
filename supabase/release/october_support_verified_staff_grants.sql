-- RELEASE-ONLY PROPOSAL. Do not run automatically or without a fresh live
-- identity/permission review and explicit Production approval.
begin;
do $$
begin
  if (select count(*) from public.profiles p join auth.users u on u.id=p.id
      where p.is_employee and p.workforce_visible and p.login_enabled
        and p.status::text in ('active','intern','probation')
        and p.removed_at is null and not p.onboarding_required
        and u.deleted_at is null and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until<=now())
        and ((p.id='04f7ade2-99ee-43d1-b4c0-de2cd168fc39' and p.full_name='Fatima Suhara'
              and p.designation='Sales Coordinator' and lower(p.email)='salesheadbsmile@gmail.com' and lower(u.email)=lower(p.email))
          or (p.id='28516281-ec1c-4902-a786-346e1a51f001' and p.full_name='Fatima KR'
              and p.designation='Sales  Coordinator' and lower(p.email)='marketingcobsmile@gmail.com' and lower(u.email)=lower(p.email))
          or (p.id='ccb736c8-de18-4dec-9b18-cda4c3fdd1b5' and p.full_name='Diya Anthikat'
              and p.designation='Admin / Social Worker' and lower(p.email)='diyaassistantmanager@gmail.com' and lower(u.email)=lower(p.email)))) <> 3 then
    raise exception 'All three intended operational staff identities must pass current verification';
  end if;
  if (select count(*) from public.permissions where code in
      ('leave.request','leads.edit','sales.edit','leads.convert_to_patient','patients.create')) <> 5 then
    raise exception 'One or more required existing permissions are missing';
  end if;
end $$;

insert into public.user_permission_grants(profile_id, permission_id, reason)
select target.profile_id, permission.id, 'Approved October support scoped staff access'
from (values
 ('28516281-ec1c-4902-a786-346e1a51f001'::uuid,'leave.request'),
 ('04f7ade2-99ee-43d1-b4c0-de2cd168fc39'::uuid,'leads.convert_to_patient'),
 ('04f7ade2-99ee-43d1-b4c0-de2cd168fc39'::uuid,'patients.create'),
 ('28516281-ec1c-4902-a786-346e1a51f001'::uuid,'leads.convert_to_patient'),
 ('28516281-ec1c-4902-a786-346e1a51f001'::uuid,'patients.create'),
 ('ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid,'leads.convert_to_patient'),
 ('ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid,'patients.create'),
 ('ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid,'leads.edit'),
 ('ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid,'sales.edit')
) target(profile_id, code)
join public.permissions permission on permission.code=target.code
where not exists (select 1 from public.user_permission_grants g
 where g.profile_id=target.profile_id and g.permission_id=permission.id and g.revoked_at is null
 and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()));
commit;
