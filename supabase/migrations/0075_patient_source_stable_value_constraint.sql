-- Allow the patient source dropdown to save stable values while existing
-- legacy labels continue to load safely.
do $$
begin
  alter table public.patients drop constraint if exists patients_source_check;
  alter table public.patients add constraint patients_source_check check (
    source is null
    or source in (
      'walk_in','phone_call','whatsapp','website','social_media','referral','campaign','existing_patient','other',
      'Website','Walk-in','Referral','Social media','Google','Existing patient','Corporate','Other'
    )
  );
end $$;
