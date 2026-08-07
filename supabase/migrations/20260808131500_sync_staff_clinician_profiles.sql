-- Keep future staff psychologist and Psychology Intern accounts in the shared
-- clinician registry using the immutable profile UUID relationship.

create or replace function public.sync_staff_clinician_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_clinical_staff boolean;
  next_type text;
begin
  is_clinical_staff := new.is_employee
    and new.status = 'active'
    and (
      new.role::text = 'psychologist'
      or lower(coalesce(new.designation, '')) like '%psychologist%'
      or lower(coalesce(new.designation, '')) = 'psychology intern'
    );
  next_type := case when lower(coalesce(new.designation, '')) like '%intern%'
    then 'psychology_intern' else 'staff_psychologist' end;

  if is_clinical_staff then
    insert into public.outsourced_doctors(
      doctor_name, specialization, qualification, phone, email,
      consultation_duration_minutes, status, profile_id, clinician_type
    ) values (
      new.full_name, 'Psychology', coalesce(nullif(trim(new.designation), ''), 'Psychologist'),
      coalesce(nullif(trim(new.phone), ''), 'Not provided'), new.email,
      30, 'active', new.id, next_type
    )
    on conflict(profile_id) where profile_id is not null do update set
      doctor_name = excluded.doctor_name,
      qualification = excluded.qualification,
      phone = excluded.phone,
      email = excluded.email,
      clinician_type = excluded.clinician_type,
      status = 'active',
      archived_at = null,
      archived_by = null;
  elsif tg_op = 'UPDATE' and old.is_employee and exists(select 1 from public.outsourced_doctors where profile_id = new.id and clinician_type <> 'outsourced') then
    update public.outsourced_doctors
    set status = 'unavailable'
    where profile_id = new.id and clinician_type <> 'outsourced';
  end if;
  return new;
end $$;

revoke execute on function public.sync_staff_clinician_profile() from public, anon, authenticated;
drop trigger if exists profiles_sync_staff_clinician on public.profiles;
create trigger profiles_sync_staff_clinician
after insert or update of full_name, email, phone, designation, role, status, is_employee on public.profiles
for each row execute function public.sync_staff_clinician_profile();

notify pgrst, 'reload schema';
