begin;

alter type public.record_status add value if not exists 'on_leave';
alter type public.record_status add value if not exists 'terminated';

create or replace function public.change_employee_status(target_profile uuid, next_status text, change_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare target public.profiles%rowtype;
declare updated public.profiles%rowtype;
begin
  select * into target from public.profiles where id = target_profile;
  if target.id is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if next_status not in ('active', 'inactive', 'on_leave', 'intern', 'probation', 'resigned', 'terminated') then
    raise exception 'Choose a valid employee status' using errcode = '22023';
  end if;
  if next_status in ('inactive', 'resigned', 'terminated') and length(trim(coalesce(change_reason, ''))) < 3 then
    raise exception 'Provide a reason for this status change' using errcode = '22023';
  end if;
  if length(coalesce(change_reason, '')) > 1000 then raise exception 'Status reason must be 1,000 characters or fewer' using errcode = '22023'; end if;

  perform set_config('app.employee_status_reason', coalesce(nullif(trim(change_reason), ''), ''), true);
  update public.profiles set status = next_status::public.record_status where id = target.id returning * into updated;
  return updated;
end
$$;

revoke all on function public.change_employee_status(uuid, text, text) from public, anon;
grant execute on function public.change_employee_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
