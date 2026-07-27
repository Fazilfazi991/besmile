-- Per-device browser push subscriptions. Endpoint and key material are private
-- delivery credentials and are never selectable by other browser users.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_name text,
  browser_name text,
  platform text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  last_test_at timestamptz,
  last_error text,
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_active_idx on public.push_subscriptions(user_id) where is_active;
alter table public.push_subscriptions enable row level security;
drop policy if exists "push subscriptions own select" on public.push_subscriptions;
drop policy if exists "push subscriptions own insert" on public.push_subscriptions;
drop policy if exists "push subscriptions own update" on public.push_subscriptions;
drop policy if exists "push subscriptions own delete" on public.push_subscriptions;
create policy "push subscriptions own select" on public.push_subscriptions for select to authenticated using(user_id = auth.uid());
create policy "push subscriptions own insert" on public.push_subscriptions for insert to authenticated with check(user_id = auth.uid());
create policy "push subscriptions own update" on public.push_subscriptions for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy "push subscriptions own delete" on public.push_subscriptions for delete to authenticated using(user_id = auth.uid());
drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at before update on public.push_subscriptions for each row execute function public.touch_updated_at();
