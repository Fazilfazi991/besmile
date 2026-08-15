-- A patient activity row must always reference an existing patient. The existing
-- AFTER DELETE trigger attempted to write a child activity row after the parent
-- had been removed, making a valid patient delete fail its foreign key check.
create or replace function public.patient_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'patients' then
    if tg_op = 'DELETE' then
      insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
      values (auth.uid(), 'patient_deleted', 'patients', old.id, to_jsonb(old), null);
      return old;
    end if;

    insert into public.patient_activity_logs(patient_id, action, entity_type, entity_id, performed_by, metadata)
    values (
      new.id,
      case when tg_op = 'INSERT' then 'patient_created' else 'patient_updated' end,
      'patient',
      new.id,
      auth.uid(),
      '{}'::jsonb
    );
  elsif tg_table_name = 'patient_documents' then
    insert into public.patient_activity_logs(patient_id, document_id, action, entity_type, entity_id, performed_by, metadata)
    values (
      coalesce(new.patient_id, old.patient_id),
      coalesce(new.id, old.id),
      case
        when tg_op = 'INSERT' then 'document_uploaded'
        when new.deleted_at is not null and old.deleted_at is null then 'document_deleted'
        when new.status = 'archived' then 'document_archived'
        when new.status = 'replaced' then 'document_replaced'
        else 'document_updated'
      end,
      'patient_document',
      coalesce(new.id, old.id),
      auth.uid(),
      jsonb_build_object('version', coalesce(new.version, old.version))
    );
  end if;

  return coalesce(new, old);
end;
$$;
