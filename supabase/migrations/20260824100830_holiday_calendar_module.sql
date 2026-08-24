-- Standalone organisational Holiday Calendar.  This deliberately does not use
-- calendar_blocks or meetings: those are My Calendar records.  The legacy
-- holidays/awareness_events tables continue to support existing attendance UI
-- and are not backfilled or recalculated by this migration.
create table if not exists public.holiday_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  event_type text not null check (event_type in ('holiday', 'awareness', 'observance')),
  start_date date,
  end_date date,
  date_precision text not null default 'day' check (date_precision in ('day', 'month', 'period_label')),
  is_non_working_day boolean not null default false,
  description text,
  year integer not null check (year between 2000 and 2100),
  source text,
  source_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  check ((start_date is null and end_date is null) or (start_date is not null and end_date is not null and end_date >= start_date)),
  check ((date_precision = 'period_label') or start_date is not null),
  check (event_type <> 'awareness' or is_non_working_day = false)
);

create index if not exists holiday_calendar_events_range_idx on public.holiday_calendar_events(start_date, end_date);
create index if not exists holiday_calendar_events_year_idx on public.holiday_calendar_events(year, event_type);

create or replace function public.set_holiday_calendar_event_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists holiday_calendar_events_set_updated_at on public.holiday_calendar_events;
create trigger holiday_calendar_events_set_updated_at before update on public.holiday_calendar_events
for each row execute function public.set_holiday_calendar_event_updated_at();

alter table public.holiday_calendar_events enable row level security;
revoke all on table public.holiday_calendar_events from anon, authenticated;
grant select, insert, update, delete on table public.holiday_calendar_events to authenticated;
create policy "holiday calendar events readable" on public.holiday_calendar_events for select to authenticated using (true);
create policy "holiday calendar events managed" on public.holiday_calendar_events for all to authenticated
using (public.has_permission('holiday_calendar.manage'))
with check (public.has_permission('holiday_calendar.manage'));

insert into public.permissions(code, description) values
  ('holiday_calendar.manage', 'Manage organisational holiday calendar events')
on conflict(code) do update set description = excluded.description;

-- Preserve the existing RBAC model: only canonical management roles receive
-- the management capability. Other roles remain view-only through RLS.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id from public.roles role cross join public.permissions permission
    where role.code in ('chairman', 'director', 'general_manager') and permission.code = 'holiday_calendar.manage'
    on conflict do nothing;
  end if;
end $$;

-- Exact transcription of the client-supplied BSmile 2026-2027 Calendar PDF.
-- `period_label` preserves the PDF's "Mid-October" wording without inventing
-- arbitrary start/end dates. Awareness and observance records are always
-- informational; no attendance, leave, payroll, or weekly-off data is changed.
insert into public.holiday_calendar_events
  (title, event_type, start_date, end_date, date_precision, is_non_working_day, description, year, source, source_key)
values
('Friendship Day','awareness','2026-08-02','2026-08-02','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-02-friendship-day'),
('International Youth Day','awareness','2026-08-12','2026-08-12','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-12-international-youth-day'),
('Independence Day','holiday','2026-08-15','2026-08-15','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-15-independence-day'),
('National Counseling Psychology Day','awareness','2026-08-17','2026-08-17','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-17-national-counseling-psychology-day'),
('Milad un-Nabi','holiday','2026-08-25','2026-08-25','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-25-milad-un-nabi'),
('Onam','holiday','2026-08-26','2026-08-27','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-26-onam'),
('National Grief Awareness Day','awareness','2026-08-30','2026-08-30','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-30-national-grief-awareness-day'),
('International Overdose Awareness Day','awareness','2026-08-31','2026-08-31','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-08-31-international-overdose-awareness-day'),
('Sri Krishna Jayanthi','holiday','2026-09-04','2026-09-04','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-09-04-sri-krishna-jayanthi'),
('World Suicide Prevention Day','awareness','2026-09-10','2026-09-10','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-09-10-world-suicide-prevention-day'),
('World Alzheimer''s Day','awareness','2026-09-21','2026-09-21','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-09-21-world-alzheimers-day'),
('Mahatma Gandhi Jayanthi','holiday','2026-10-02','2026-10-02','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-10-02-mahatma-gandhi-jayanthi'),
('World Mental Health Day','awareness','2026-10-10','2026-10-10','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-10-10-world-mental-health-day'),
('Dussehra','holiday','2026-10-24','2026-10-24','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-10-24-dussehra'),
('ADHD Awareness Month','observance','2026-10-01','2026-10-31','month',false,'Month-level observance shown in the supplied BSmile calendar.',2026,'BSmile 2026-2027 Calendar PDF','2026-10-adhd-awareness-month'),
('Mid-October - OCD Awareness Week','observance',null,null,'period_label',false,'The supplied BSmile calendar specifies Mid-October but does not supply exact dates.',2026,'BSmile 2026-2027 Calendar PDF','2026-10-mid-october-ocd-awareness-week'),
('International Stress Awareness Day','awareness','2026-11-04','2026-11-04','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-04-international-stress-awareness-day'),
('Deepavali','holiday','2026-11-08','2026-11-08','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-08-deepavali'),
('World Kindness Day','awareness','2026-11-13','2026-11-13','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-13-world-kindness-day'),
('Children''s Day (India)','awareness','2026-11-14','2026-11-14','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-14-childrens-day-india'),
('International Men''s Day','awareness','2026-11-19','2026-11-19','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-19-international-mens-day'),
('International Day for the Elimination of Violence Against Women','awareness','2026-11-25','2026-11-25','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-11-25-elimination-violence-against-women'),
('International Day of Persons with Disabilities','awareness','2026-12-03','2026-12-03','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-12-03-persons-with-disabilities'),
('Human Rights Day','awareness','2026-12-10','2026-12-10','day',false,null,2026,'BSmile 2026-2027 Calendar PDF','2026-12-10-human-rights-day'),
('Christmas','holiday','2026-12-25','2026-12-25','day',true,null,2026,'BSmile 2026-2027 Calendar PDF','2026-12-25-christmas'),
('World Braille Day','awareness','2027-01-04','2027-01-04','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-01-04-world-braille-day'),
('National Girl Child Day (India)','awareness','2027-01-24','2027-01-24','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-01-24-national-girl-child-day-india'),
('Republic Day','holiday','2027-01-26','2027-01-26','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-01-26-republic-day'),
('World Cancer Day','awareness','2027-02-04','2027-02-04','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-02-04-world-cancer-day'),
('World Day of Social Justice','awareness','2027-02-20','2027-02-20','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-02-20-world-day-social-justice'),
('Shivarathri','holiday','2027-03-06','2027-03-06','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-06-shivarathri'),
('International Women''s Day','awareness','2027-03-08','2027-03-08','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-08-international-womens-day'),
('Ramazan Eid','holiday','2027-03-10','2027-03-10','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-10-ramazan-eid'),
('International Day of Happiness','awareness','2027-03-20','2027-03-20','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-20-international-day-of-happiness'),
('Good Friday','holiday','2027-03-26','2027-03-26','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-26-good-friday'),
('Easter','holiday','2027-03-28','2027-03-28','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-03-28-easter'),
('World Autism Awareness Day','awareness','2027-04-02','2027-04-02','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-04-02-world-autism-awareness-day'),
('World Health Day','awareness','2027-04-07','2027-04-07','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-04-07-world-health-day'),
('Ambedkar Jayanthi','holiday','2027-04-14','2027-04-14','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-04-14-ambedkar-jayanthi'),
('Vishu','holiday','2027-04-15','2027-04-15','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-04-15-vishu'),
('World Earth Day','awareness','2027-04-22','2027-04-22','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-04-22-world-earth-day'),
('Mother''s Day','awareness','2027-05-09','2027-05-09','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-05-09-mothers-day'),
('International Day of Families','awareness','2027-05-15','2027-05-15','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-05-15-international-day-of-families'),
('Bakrid','holiday','2027-05-17','2027-05-17','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-05-17-bakrid'),
('World No Tobacco Day','awareness','2027-05-31','2027-05-31','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-05-31-world-no-tobacco-day'),
('World Environment Day','awareness','2027-06-05','2027-06-05','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-05-world-environment-day'),
('World Day Against Child Labour','awareness','2027-06-12','2027-06-12','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-12-world-day-against-child-labour'),
('World Elder Abuse Awareness Day','awareness','2027-06-15','2027-06-15','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-15-world-elder-abuse-awareness-day'),
('Muharram','holiday','2027-06-16','2027-06-16','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-16-muharram'),
('Father''s Day','awareness','2027-06-20','2027-06-20','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-20-fathers-day'),
('International Yoga & World Music Day','awareness','2027-06-21','2027-06-21','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-21-international-yoga-world-music-day'),
('International Day Against Drug Abuse and Illicit Trafficking','awareness','2027-06-26','2027-06-26','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-06-26-international-day-against-drug-abuse'),
('National Doctors'' Day (India)','awareness','2027-07-01','2027-07-01','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-07-01-national-doctors-day-india'),
('Cheer Up the Lonely Day','awareness','2027-07-11','2027-07-11','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-07-11-cheer-up-the-lonely-day'),
('World Brain Day','awareness','2027-07-22','2027-07-22','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-07-22-world-brain-day'),
('International Self-Care Day','awareness','2027-07-24','2027-07-24','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-07-24-international-self-care-day'),
('National Schizophrenia Awareness Day (India)','awareness','2027-07-25','2027-07-25','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-07-25-national-schizophrenia-awareness-day-india'),
('Friendship Day','awareness','2027-08-01','2027-08-01','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-01-friendship-day'),
('International Youth Day','awareness','2027-08-12','2027-08-12','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-12-international-youth-day'),
('Milad un-Nabi','holiday','2027-08-14','2027-08-14','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-14-milad-un-nabi'),
('Independence Day','holiday','2027-08-15','2027-08-15','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-15-independence-day'),
('National Counseling Psychology Day','awareness','2027-08-17','2027-08-17','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-17-national-counseling-psychology-day'),
('National Grief Awareness Day','awareness','2027-08-30','2027-08-30','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-30-national-grief-awareness-day'),
('International Overdose Awareness Day','awareness','2027-08-31','2027-08-31','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-08-31-international-overdose-awareness-day'),
('Sri Krishna Jayanthi','holiday','2027-09-04','2027-09-04','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-09-04-sri-krishna-jayanthi'),
('World Suicide Prevention Day','awareness','2027-09-10','2027-09-10','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-09-10-world-suicide-prevention-day'),
('Onam','holiday','2027-09-16','2027-09-17','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-09-16-onam'),
('World Alzheimer''s Day','awareness','2027-09-21','2027-09-21','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-09-21-world-alzheimers-day'),
('Mahatma Gandhi Jayanthi','holiday','2027-10-02','2027-10-02','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-10-02-mahatma-gandhi-jayanthi'),
('Dussehra','holiday','2027-10-08','2027-10-08','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-10-08-dussehra'),
('World Mental Health Day','awareness','2027-10-10','2027-10-10','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-10-10-world-mental-health-day'),
('Deepavali','holiday','2027-10-30','2027-10-30','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-10-30-deepavali'),
('ADHD Awareness Month','observance','2027-10-01','2027-10-31','month',false,'Month-level observance shown in the supplied BSmile calendar.',2027,'BSmile 2026-2027 Calendar PDF','2027-10-adhd-awareness-month'),
('Mid-October - OCD Awareness Week','observance',null,null,'period_label',false,'The supplied BSmile calendar specifies Mid-October but does not supply exact dates.',2027,'BSmile 2026-2027 Calendar PDF','2027-10-mid-october-ocd-awareness-week'),
('International Stress Awareness Day','awareness','2027-11-03','2027-11-03','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-11-03-international-stress-awareness-day'),
('World Kindness Day','awareness','2027-11-13','2027-11-13','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-11-13-world-kindness-day'),
('Children''s Day (India)','awareness','2027-11-14','2027-11-14','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-11-14-childrens-day-india'),
('International Men''s Day','awareness','2027-11-19','2027-11-19','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-11-19-international-mens-day'),
('International Day for the Elimination of Violence Against Women','awareness','2027-11-25','2027-11-25','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-11-25-elimination-violence-against-women'),
('International Day of Persons with Disabilities','awareness','2027-12-03','2027-12-03','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-12-03-persons-with-disabilities'),
('Human Rights Day','awareness','2027-12-10','2027-12-10','day',false,null,2027,'BSmile 2026-2027 Calendar PDF','2027-12-10-human-rights-day'),
('Christmas','holiday','2027-12-25','2027-12-25','day',true,null,2027,'BSmile 2026-2027 Calendar PDF','2027-12-25-christmas')
on conflict(source_key) do update set
  title = excluded.title, event_type = excluded.event_type, start_date = excluded.start_date, end_date = excluded.end_date,
  date_precision = excluded.date_precision, is_non_working_day = excluded.is_non_working_day, description = excluded.description,
  year = excluded.year, source = excluded.source, updated_at = now();
