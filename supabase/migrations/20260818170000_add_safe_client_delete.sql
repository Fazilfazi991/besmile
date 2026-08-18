-- Clients are hard-deleted only when their operational history has no
-- restrictive dependencies. The existing patient DELETE trigger records the
-- durable audit event in audit_logs; transient per-client activity rows must
-- be cleared first because they reference the client being removed.
create or replace function public.delete_client(target_client uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  client public.patients%rowtype;
  deleted_client uuid;
begin
  if auth.uid() is null or not public.has_permission('patients.delete') then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;

  select * into client
  from public.patients
  where id = target_client
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.doctor_appointments where patient_id = target_client)
    or exists (select 1 from public.patient_sessions where patient_id = target_client)
    or exists (select 1 from public.patient_documents where patient_id = target_client)
    or exists (select 1 from public.patient_notes where patient_id = target_client)
    or exists (select 1 from public.crm_leads where converted_patient_id = target_client) then
    raise exception 'This client has linked operational records and cannot be deleted. Archive or remove those records through their supported workflows first.' using errcode = 'P0001';
  end if;

  -- This table is a child activity feed, not the durable audit trail. Keeping
  -- it would violate its patient_id foreign key on a valid hard delete.
  delete from public.patient_activity_logs where patient_id = target_client;

  delete from public.patients
  where id = target_client
  returning id into deleted_client;

  return deleted_client;
end;
$$;

revoke all on function public.delete_client(uuid) from public, anon;
grant execute on function public.delete_client(uuid) to authenticated;

notify pgrst, 'reload schema';
