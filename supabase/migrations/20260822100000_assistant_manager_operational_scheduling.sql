-- Assistant Managers already receive the appointment workflow grants in
-- 20260819110000 and the narrow all-clinician availability grant in
-- 20260819140000. Keep those paths canonical: this closes the remaining
-- blocked-period RLS gap without granting clinician profile/lifecycle access.

drop policy if exists "doctor scheduling blocked manage" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked manage" on public.doctor_blocked_periods
  for all to authenticated
  using (
    public.has_permission('doctor_scheduling.manage_doctors')
    or public.has_permission('clinician.availability.manage_all')
    or (doctor_id = (select public.current_clinician_id()) and blocked_date >= current_date)
  )
  with check (
    public.has_permission('doctor_scheduling.manage_doctors')
    or public.has_permission('clinician.availability.manage_all')
    or (doctor_id = (select public.current_clinician_id()) and blocked_date >= current_date and created_by = (select auth.uid()))
  );

notify pgrst, 'reload schema';
