-- Keep leave integrity in the database so concurrent/direct Data API writes
-- cannot bypass the client overlap guard, and attribute decisions correctly.
create or replace function public.enforce_leave_request_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending', 'approved') and exists (
    select 1
    from public.leave_requests existing
    where existing.profile_id = new.profile_id
      and existing.id is distinct from new.id
      and existing.status in ('pending', 'approved')
      and daterange(existing.starts_on, existing.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'These dates overlap an existing active leave request.' using errcode = '23P01';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_leave_request_overlap() from public, anon, authenticated;
drop trigger if exists leave_requests_prevent_overlap on public.leave_requests;
create trigger leave_requests_prevent_overlap
before insert or update of profile_id, starts_on, ends_on, status on public.leave_requests
for each row execute function public.enforce_leave_request_overlap();

create or replace function public.notify_leave_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare manager record;
begin
  if TG_OP = 'INSERT' then
    for manager in
      select id from public.profiles
      where role in ('super_admin','chairman','director','general_manager')
        and status = 'active'
        and workforce_visible
    loop
      perform public.notify_user(manager.id,'New leave request','An employee submitted a leave request.','leave_submitted',new.id,'/admin/leaves?request='||new.id::text,new.profile_id,'leave','high','standard',true,jsonb_build_object('entity_type','leave_request','destination_url','/admin/leaves?request='||new.id::text));
    end loop;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.notify_user(new.profile_id,'Leave request '||new.status,'Your leave request was '||new.status||'.','leave_'||new.status,new.id,'/employee/leaves?request='||new.id::text,coalesce(new.reviewed_by,new.approver_id),'leave','high',case when new.status='approved' then 'success' else 'warning' end,true,jsonb_build_object('entity_type','leave_request','destination_url','/employee/leaves?request='||new.id::text));
  end if;
  return new;
end
$$;

revoke all on function public.notify_leave_event() from public, anon, authenticated;
