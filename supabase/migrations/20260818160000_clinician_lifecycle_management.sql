-- Soft clinician lifecycle with server-side authorization and operational dependency checks.

create or replace function public.set_clinician_active(target_doctor uuid, make_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_row public.outsourced_doctors%rowtype;
  next_row public.outsourced_doctors%rowtype;
  blocked_appointments integer;
begin
  if (select auth.uid()) is null or not public.has_permission('doctor_scheduling.manage_doctors') then
    raise exception 'Permission denied for clinician lifecycle management' using errcode = '42501';
  end if;

  select * into previous_row from public.outsourced_doctors where id = target_doctor for update;
  if previous_row.id is null then raise exception 'Clinician unavailable.'; end if;

  if not make_active then
    select count(*) into blocked_appointments
    from public.doctor_appointments appointment
    where appointment.doctor_id = target_doctor
      and appointment.deleted_at is null
      and appointment.status in ('scheduled', 'confirmed', 'rescheduled')
      and appointment.end_at > now();
    if blocked_appointments > 0 then
      raise exception 'This clinician has % upcoming or active appointment%. Reassign or cancel them before removing the clinician.', blocked_appointments, case when blocked_appointments = 1 then '' else 's' end;
    end if;
  end if;

  perform set_config('app.clinician_lifecycle', 'true', true);
  update public.outsourced_doctors
  set status = case when make_active then 'active' else 'unavailable' end,
      archived_at = case when make_active then null else coalesce(archived_at, now()) end,
      archived_by = case when make_active then null else (select auth.uid()) end,
      updated_by = (select auth.uid())
  where id = target_doctor
  returning * into next_row;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values ((select auth.uid()), case when make_active then 'clinician_restored' else 'clinician_removed' end, 'outsourced_doctors', target_doctor, to_jsonb(previous_row), to_jsonb(next_row));
  return target_doctor;
end;
$$;

revoke all on function public.set_clinician_active(uuid, boolean) from public, anon;
grant execute on function public.set_clinician_active(uuid, boolean) to authenticated, service_role;

create or replace function public.prevent_direct_clinician_lifecycle_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is distinct from old.archived_at
    and current_setting('app.clinician_lifecycle', true) is distinct from 'true' then
    raise exception 'Use clinician lifecycle management to remove or restore a clinician.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_direct_clinician_lifecycle_change() from public, anon, authenticated;
drop trigger if exists outsourced_doctors_lifecycle_guard on public.outsourced_doctors;
create trigger outsourced_doctors_lifecycle_guard before update on public.outsourced_doctors
for each row execute function public.prevent_direct_clinician_lifecycle_change();

drop policy if exists "doctor scheduling doctors view" on public.outsourced_doctors;
create policy "doctor scheduling doctors view" on public.outsourced_doctors for select to authenticated using (
  public.has_permission('doctor_scheduling.manage_doctors')
  or id = (select public.current_clinician_id())
  or public.appointment_has_permission('view')
  or public.appointment_has_permission('create')
  or public.appointment_has_permission('update')
  or public.appointment_has_permission('reschedule')
);

notify pgrst, 'reload schema';
