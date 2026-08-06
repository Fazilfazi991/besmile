-- The original expression double-escaped the dot and rejected ordinary emails.
alter table public.outsourced_doctors drop constraint if exists outsourced_doctors_email_format;
alter table public.outsourced_doctors add constraint outsourced_doctors_email_format
check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
