-- Add optional contact information and forward-only doctor archiving.

alter table public.outsourced_doctors add column if not exists email text;
alter table public.outsourced_doctors add column if not exists archived_at timestamptz;
alter table public.outsourced_doctors add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.outsourced_doctors drop constraint if exists outsourced_doctors_email_format;
alter table public.outsourced_doctors add constraint outsourced_doctors_email_format check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$');
create index if not exists outsourced_doctors_active_idx on public.outsourced_doctors(status, doctor_name) where archived_at is null;

notify pgrst, 'reload schema';
