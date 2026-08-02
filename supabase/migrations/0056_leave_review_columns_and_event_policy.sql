-- Align leave review persistence with the admin approval workflow.
alter table public.leave_requests
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

drop policy if exists "leave events management insert" on public.leave_approval_events;
drop policy if exists "leave events authorized insert" on public.leave_approval_events;
create policy "leave events authorized insert" on public.leave_approval_events
for insert to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1
    from public.leave_requests request
    where request.id = leave_request_id
      and public.leave_employee_can_manage(request.profile_id)
  )
);
