-- Batch 2 follow-up: outsourced psychologists are external clinicians; internal
-- authorized users record the non-clinical payment-eligibility marker.
insert into public.permissions(code, description)
values ('online_psychologists.manage', 'Manage outsourced online psychologist sessions')
on conflict (code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role, permission_id)
    select management_role.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as management_role(role_name)
    join public.permissions permission on permission.code='online_psychologists.manage'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id from public.roles role join public.permissions permission on permission.code='online_psychologists.manage'
    where role.code in ('chairman','director','general_manager') on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema';
  end if;
end $$;

drop policy if exists "psychologist session records submit" on public.psychologist_session_records;
create policy "psychologist session records authorized operational submit"
on public.psychologist_session_records for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and public.has_permission('online_psychologists.manage')
  and exists (
    select 1 from public.doctor_appointments appointment
    join public.outsourced_doctors clinician on clinician.id=appointment.doctor_id
    where appointment.id=appointment_id
      and appointment.status='completed'
      and appointment.consultation_type='online'
      and appointment.deleted_at is null
      and clinician.clinician_type='outsourced'
      and clinician.archived_at is null
  )
);

notify pgrst, 'reload schema';
