-- Let a patient creator read the row during INSERT ... RETURNING so the app can
-- redirect to the generated slug. Broader patient visibility remains governed
-- by the existing patient_access policy.
drop policy if exists "patient records creator returning" on public.patients;
create policy "patient records creator returning"
on public.patients
for select
to authenticated
using (
  deleted_at is null
  and created_by = auth.uid()
  and public.has_permission('patients.view')
);
