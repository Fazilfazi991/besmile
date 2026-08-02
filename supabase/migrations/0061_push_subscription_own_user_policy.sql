-- Reassert browser push subscription ownership. A user may only see, create,
-- update, or delete subscriptions attached to their own authenticated profile.
alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions own select" on public.push_subscriptions;
drop policy if exists "push subscriptions own insert" on public.push_subscriptions;
drop policy if exists "push subscriptions own update" on public.push_subscriptions;
drop policy if exists "push subscriptions own delete" on public.push_subscriptions;
drop policy if exists "push subscriptions own user select" on public.push_subscriptions;
drop policy if exists "push subscriptions own user insert" on public.push_subscriptions;
drop policy if exists "push subscriptions own user update" on public.push_subscriptions;
drop policy if exists "push subscriptions own user delete" on public.push_subscriptions;

create policy "push subscriptions own user select"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy "push subscriptions own user insert"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "push subscriptions own user update"
on public.push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "push subscriptions own user delete"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());
