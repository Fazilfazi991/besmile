-- Make patient editing auditable and preserve scoped access checks for every write.
alter table public.patients
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

drop policy if exists "patient records edit" on public.patients;
create policy "patient records edit"
on public.patients
for update
to authenticated
using (public.patient_access(id) and public.has_permission('patients.edit'))
with check (public.patient_access(id) and public.has_permission('patients.edit'));
