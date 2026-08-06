-- Keep optional doctor emails compatible with older clients that submit blanks.
create or replace function public.normalize_outsourced_doctor_email()
returns trigger language plpgsql set search_path=public as $$
begin
  new.email := nullif(btrim(new.email), '');
  return new;
end $$;

drop trigger if exists outsourced_doctors_normalize_email on public.outsourced_doctors;
create trigger outsourced_doctors_normalize_email
before insert or update of email on public.outsourced_doctors
for each row execute function public.normalize_outsourced_doctor_email();
