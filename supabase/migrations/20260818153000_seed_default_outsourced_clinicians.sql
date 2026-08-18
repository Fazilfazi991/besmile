-- Canonical BSmile outsourced clinician defaults.
-- These are clinician-master records only: no profiles, auth users, HR records, or
-- payroll employee records are created.  The existing appointment and psychologist
-- payable workflows already use outsourced_doctors as their shared clinician key.

alter table public.outsourced_doctors
  add column if not exists photo_url text;

comment on column public.outsourced_doctors.photo_url is
  'Versioned clinician portrait URL. Default outsourced clinician portraits are deployed with the application.';

do $$
declare
  seed record;
  target_id uuid;
begin
  for seed in
    select *
    from (values
      ('Anagha Pushppan', 'Licensed Clinical Psychologist (Consultant)', '/images/clinicians/anagha-pushppan.webp'),
      ('Dr. Xavier', 'Consultant Psychologist', '/images/clinicians/dr-xavier.webp'),
      ('Aiswarya P', 'Psychologist / Behavioral Therapist', '/images/clinicians/aiswarya-p.webp'),
      ('Anushma VK', 'Social Worker (Medical And Psychiatry)', '/images/clinicians/anushma-vk.webp'),
      ('Adil Hussain', 'Legal Advisor', '/images/clinicians/adil-hussain.webp'),
      ('Diya Anthikat', 'Professional Social Worker', '/images/clinicians/diya-anthikat.webp'),
      ('Devapriya Thirikkot', 'Consultant Psychologist', '/images/clinicians/devapriya-thirikkot.webp'),
      ('Anjana Krishna', 'Consultant - Counselling Psychologist', '/images/clinicians/anjana-krishna.webp'),
      ('Kallu Sajeev', 'Consultant Psychologist', '/images/clinicians/kallu-sajeev.webp'),
      ('Sreelekshmi A M', 'Consultant Psychologist', '/images/clinicians/sreelekshmi-a-m.webp'),
      ('Deepika Jayaraj', 'Consultant Psychologist', '/images/clinicians/deepika-jayaraj.webp'),
      ('Kavya VR', 'Consultant Counselling Psychologist', '/images/clinicians/kavya-vr.webp'),
      ('Noufira M.N', 'Consultant Psychologist', '/images/clinicians/noufira-m-n.webp'),
      ('Safna PV', 'Consultant Counselling Psychologist', '/images/clinicians/safna-pv.webp'),
      ('Sana KS', 'Consultant Psychologist', '/images/clinicians/sana-ks.webp'),
      ('Anjaly Varghese', 'Consultant Psychologist', '/images/clinicians/anjaly-varghese.webp'),
      ('Sanahira Shanavas', 'Consultant Psychologist', '/images/clinicians/sanahira-shanavas.webp'),
      ('Jasna RC', 'Consultant Psychologist', '/images/clinicians/jasna-rc.webp'),
      ('Surya PS', 'Consultant Psychologist', '/images/clinicians/surya-ps.webp'),
      ('Sameeha Saleem', 'Consultant Psychologist', '/images/clinicians/sameeha-saleem.webp'),
      ('Athira Pothasseri', 'Consultant Psychologist', '/images/clinicians/athira-pothasseri.webp')
    ) as seed_rows(doctor_name, designation, photo_url)
  loop
    -- Punctuation, spacing, and case are ignored for matching. Prefer an active
    -- record, then the oldest archived one so a legacy record is reused safely.
    select clinician.id into target_id
    from public.outsourced_doctors clinician
    where lower(regexp_replace(clinician.doctor_name, '[^[:alnum:]]+', '', 'g'))
        = lower(regexp_replace(seed.doctor_name, '[^[:alnum:]]+', '', 'g'))
    order by (clinician.archived_at is null) desc, clinician.created_at asc
    limit 1;

    if target_id is null then
      insert into public.outsourced_doctors(
        doctor_name, specialization, qualification, phone, consultation_duration_minutes,
        status, clinician_type, self_service_enabled, photo_url, notes
      ) values (
        seed.doctor_name, 'Psychology', seed.designation, 'Not provided', 30,
        'active', 'outsourced', false, seed.photo_url, 'Default BSmile outsourced clinician.'
      ) returning id into target_id;
    else
      -- Do not change active/inactive state, account linkage, contact details,
      -- availability, or historical records.  Only repair the default presentation
      -- and classification fields when the matching legacy record is incomplete.
      update public.outsourced_doctors
      set doctor_name = seed.doctor_name,
          specialization = case when nullif(trim(specialization), '') is null then 'Psychology' else specialization end,
          qualification = case when nullif(trim(qualification), '') is null then seed.designation else qualification end,
          photo_url = case when nullif(trim(photo_url), '') is null then seed.photo_url else photo_url end,
          clinician_type = case when clinician.clinician_type is null or trim(clinician.clinician_type) = '' then 'outsourced' else clinician.clinician_type end,
          self_service_enabled = case when profile_id is null then false else self_service_enabled end
      where id = target_id;
    end if;

    -- Default office hours make newly seeded (and legacy unconfigured) clinicians
    -- immediately schedulable without replacing any deliberately configured hours.
    if not exists (select 1 from public.doctor_weekly_availability where doctor_id = target_id) then
      insert into public.doctor_weekly_availability(doctor_id, day_of_week, start_time, end_time)
      select target_id, day_number, '09:00'::time, '17:00'::time
      from generate_series(1, 6) as day_number;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
