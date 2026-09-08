-- Attendance exceptions are regularized through a separate, auditable record.
-- Original clock and verified-location evidence in public.attendance is never overwritten.
create table if not exists public.attendance_regularization_requests (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_clock_in timestamptz,
  requested_clock_out timestamptz,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_regularization_one_pending_idx
  on public.attendance_regularization_requests(attendance_id)
  where status = 'pending';
create index if not exists attendance_regularization_profile_created_idx
  on public.attendance_regularization_requests(profile_id, created_at desc);

create or replace function public.attendance_regularization_reviewer_can_act(target uuid)
returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_permission('attendance.manage')
    or ((public.has_permission('attendance.view_team') or public.current_role() = 'general_manager') and public.in_management_tree(target))
$$;
revoke all on function public.attendance_regularization_reviewer_can_act(uuid) from public, anon;
grant execute on function public.attendance_regularization_reviewer_can_act(uuid) to authenticated;

create or replace function public.guard_attendance_regularization()
returns trigger
language plpgsql security definer set search_path=public as $$
declare attendance_owner uuid;
begin
  select profile_id into attendance_owner from public.attendance where id = new.attendance_id;
  if attendance_owner is null or attendance_owner <> new.profile_id then raise exception 'Regularization must belong to the original attendance record'; end if;
  if TG_OP = 'INSERT' then
    if new.profile_id <> auth.uid() or new.status <> 'pending' or new.reviewed_by is not null or new.reviewed_at is not null then raise exception 'Only the employee may submit a pending regularization request'; end if;
  elsif old.status = 'pending' and new.status in ('approved','rejected') then
    if not public.attendance_regularization_reviewer_can_act(old.profile_id) then raise exception 'You are not authorized to review this regularization request'; end if;
    if new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null then raise exception 'A review must record the authorized reviewer and timestamp'; end if;
  else
    raise exception 'Regularization requests cannot be changed after submission';
  end if;
  return new;
end $$;
revoke all on function public.guard_attendance_regularization() from public, anon, authenticated;
drop trigger if exists attendance_regularization_guard on public.attendance_regularization_requests;
create trigger attendance_regularization_guard before insert or update on public.attendance_regularization_requests for each row execute function public.guard_attendance_regularization();

create or replace function public.apply_approved_attendance_regularization()
returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'approved' and old.status = 'pending' then update public.attendance set status = 'regularized' where id = new.attendance_id; end if;
  return new;
end $$;
revoke all on function public.apply_approved_attendance_regularization() from public, anon, authenticated;
drop trigger if exists attendance_regularization_apply on public.attendance_regularization_requests;
create trigger attendance_regularization_apply after update of status on public.attendance_regularization_requests for each row execute function public.apply_approved_attendance_regularization();

alter table public.attendance_regularization_requests enable row level security;
drop policy if exists "attendance regularization own or scoped read" on public.attendance_regularization_requests;
create policy "attendance regularization own or scoped read" on public.attendance_regularization_requests for select to authenticated using (profile_id = auth.uid() or public.attendance_regularization_reviewer_can_act(profile_id));
drop policy if exists "attendance regularization employee submit" on public.attendance_regularization_requests;
create policy "attendance regularization employee submit" on public.attendance_regularization_requests for insert to authenticated with check (profile_id = auth.uid() and status = 'pending');
drop policy if exists "attendance regularization scoped review" on public.attendance_regularization_requests;
create policy "attendance regularization scoped review" on public.attendance_regularization_requests for update to authenticated using (status = 'pending' and public.attendance_regularization_reviewer_can_act(profile_id)) with check (public.attendance_regularization_reviewer_can_act(profile_id));

-- Annual Leave is legacy data for this organization. Keep its records and balances,
-- but remove it from all future selectable leave-type queries via is_active.
update public.leave_types set is_active = false, updated_at = now() where code = 'annual' and is_active;
drop policy if exists "leave types readable" on public.leave_types;
create policy "leave types active or historical request readable" on public.leave_types for select to authenticated
using (
  is_active
  or exists (
    select 1 from public.leave_requests request
    where request.leave_type_id = leave_types.id
      and public.leave_employee_can_manage(request.profile_id)
  )
);
