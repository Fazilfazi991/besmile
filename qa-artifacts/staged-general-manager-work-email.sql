-- STAGED ONLY: review against the target database before execution.
-- Never update profiles.email or auth.users.email here.
begin;
do $$
declare matching_profiles integer;
begin
  select count(*) into matching_profiles
  from public.profiles
  where employee_code = 'A001'
    and full_name = 'Mr. Muhammad Faiz AU'
    and role::text = 'general_manager'
    and status = 'active';
  if matching_profiles <> 1 then
    raise exception 'General Manager profile guard failed: expected one active A001 / Mr. Muhammad Faiz AU / general_manager, found %', matching_profiles;
  end if;
end $$;

update public.profiles
set work_email = 'bsmile.gm@gmail.com'
where employee_code = 'A001'
  and full_name = 'Mr. Muhammad Faiz AU'
  and role::text = 'general_manager'
  and status = 'active';
commit;
