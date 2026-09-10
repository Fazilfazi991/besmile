-- PostgREST UPDATE RETURNING conflicts with the policy that hides archived leads.
-- Keep that policy intact: an invoker RPC checks ROW_COUNT instead of selecting
-- the now-hidden row. All table grants, RLS and permission triggers still apply.
create or replace function public.archive_crm_lead(target_lead uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- SELECT FOR UPDATE applies the caller's SELECT/UPDATE policies and locks the
  -- live row. WHERE CURRENT OF then needs UPDATE rights without asking SELECT
  -- RLS to expose the new archived row. UPDATE checks and triggers still run.
  archive_cursor cursor for
    select id from public.crm_leads
    where id = target_lead and archived_at is null
    for update;
  selected_id uuid;
  archived_time timestamptz := clock_timestamp();
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  open archive_cursor;
  fetch archive_cursor into selected_id;
  if not found then
    raise exception 'Lead unavailable or archive not permitted' using errcode = '42501';
  end if;
  update public.crm_leads set archived_at = archived_time
  where current of archive_cursor;
  get diagnostics affected = row_count;
  close archive_cursor;

  if affected <> 1 then
    raise exception 'Lead unavailable or archive not permitted' using errcode = '42501';
  end if;
  return jsonb_build_object('id', selected_id, 'archived_at', archived_time);
end;
$$;

revoke all on function public.archive_crm_lead(uuid) from public, anon;
grant execute on function public.archive_crm_lead(uuid) to authenticated;
