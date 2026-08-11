-- Calendar events transcribed from the client-approved "calender NEW.pdf".
-- The earlier staff-structure migration already introduced the holidays and
-- awareness_events tables and seeded the recurring awareness catalogue. This
-- forward-only migration fills the remaining 2027 public holidays shown in
-- the PDF. It is idempotent and never deletes existing calendar data.

insert into public.holidays (holiday_date, name, is_active)
values
  ('2027-08-14', 'Milad un-Nabi', true),
  ('2027-08-15', 'Independence Day', true),
  ('2027-09-04', 'Sri Krishna Jayanthi', true),
  ('2027-09-12', 'Onam', true),
  ('2027-09-13', 'Onam', true),
  ('2027-10-02', 'Mahatma Gandhi Jayanthi', true),
  ('2027-10-09', 'Dussehra', true),
  ('2027-10-29', 'Deepavali', true),
  ('2027-12-25', 'Christmas', true)
on conflict (holiday_date) do nothing;
