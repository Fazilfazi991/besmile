-- Preserve the canonical event ID. Refuse an ambiguous calendar instead of
-- deleting a duplicate or silently editing an unrelated event.
begin;
do $$
declare event_id uuid;
begin
  if (select count(*) from public.holiday_calendar_events
      where title = 'Dussehra' and year = 2026) <> 1 then
    raise exception 'Expected exactly one 2026 Dussehra event; review calendar before release.';
  end if;
  select id into event_id from public.holiday_calendar_events
    where title = 'Dussehra' and year = 2026;
  if exists (select 1 from public.holiday_calendar_events
      where source_key = '2026-10-20-dussehra' and id <> event_id) then
    raise exception 'Dussehra source key conflicts with another event.';
  end if;
  update public.holiday_calendar_events
  set start_date = '2026-10-20', end_date = '2026-10-20',
      source_key = '2026-10-20-dussehra', event_type = 'holiday',
      is_non_working_day = true, updated_at = now()
  where id = event_id;
  if not exists (select 1 from public.holidays
      where name = 'Dussehra' and holiday_date = '2026-10-20')
    or exists (select 1 from public.holidays where name = 'Dussehra'
      and holiday_date between '2026-01-01' and '2026-12-31'
      and holiday_date <> '2026-10-20') then
    raise exception 'Legacy 2026 Dussehra is not on 20 October; review before release.';
  end if;
end $$;
commit;
