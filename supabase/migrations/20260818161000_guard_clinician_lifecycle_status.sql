-- Close the direct table-update bypass: availability lifecycle state must move
-- through set_clinician_active so upcoming appointment checks cannot be skipped.

create or replace function public.prevent_direct_clinician_lifecycle_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.archived_at is distinct from old.archived_at or new.status is distinct from old.status)
    and current_setting('app.clinician_lifecycle', true) is distinct from 'true' then
    raise exception 'Use clinician lifecycle management to remove or restore a clinician.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_direct_clinician_lifecycle_change() from public, anon, authenticated;
notify pgrst, 'reload schema';
