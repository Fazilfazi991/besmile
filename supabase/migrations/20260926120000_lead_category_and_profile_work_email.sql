-- Both fields are optional. Existing leads and profiles retain their current values.
alter table public.crm_leads
  add column if not exists category text
  check (category in ('Child', 'Adults'));

-- profiles.email remains the Auth/login identity. This field is for display/contact only.
alter table public.profiles
  add column if not exists work_email text;
