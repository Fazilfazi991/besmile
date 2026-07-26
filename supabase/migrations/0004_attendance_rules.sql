create table if not exists public.company_attendance_settings (id boolean primary key default true check(id), timezone text not null default 'Asia/Kolkata', work_start time not null default '09:00', work_end time not null default '18:00', grace_minutes integer not null default 10, overtime_after_minutes integer not null default 480, working_days integer[] not null default array[1,2,3,4,5]);
create table if not exists public.holidays (id uuid primary key default gen_random_uuid(), holiday_date date not null unique, name text not null);
insert into public.company_attendance_settings(id) values(true) on conflict(id) do nothing;
alter table public.company_attendance_settings enable row level security; alter table public.holidays enable row level security;
drop policy if exists "read attendance settings" on public.company_attendance_settings; create policy "read attendance settings" on public.company_attendance_settings for select to authenticated using(true);
drop policy if exists "read holidays" on public.holidays; create policy "read holidays" on public.holidays for select to authenticated using(true);
