-- Preserve the existing notification visibility rules while evaluating caller-only
-- authorization helpers once per statement instead of once for every notification.
drop policy if exists "notifications own or management read" on public.notifications;
create policy "notifications own or management read"
on public.notifications
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (select public.is_management())
  or (
    (select public.current_role()) = 'general_manager'
    and public.in_management_tree(profile_id)
  )
);

drop policy if exists "notifications private or organization access" on public.notifications;
create policy "notifications private or organization access"
on public.notifications
for all
to authenticated
using (
  profile_id = (select auth.uid())
  or (select public.has_permission('admin.access'))
)
with check (
  profile_id = (select auth.uid())
  or (select public.has_permission('admin.access'))
);
