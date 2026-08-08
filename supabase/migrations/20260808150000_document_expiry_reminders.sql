-- Document expiry reminders.  All date comparisons use the BSmile business day
-- (Asia/Dubai), so a document cannot become expired early because a browser or
-- database session is in UTC.

alter table public.documents
  add column if not exists expiry_date date,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists documents_expiry_active_idx
  on public.documents(expiry_date)
  where expiry_date is not null and archived_at is null;

create table if not exists public.document_expiry_reminder_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  reminder_days integer[] not null default array[30, 7, 1, 0],
  timezone text not null default 'Asia/Dubai',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (array_length(reminder_days, 1) between 1 and 12),
  check (reminder_days <@ array[0,1,2,3,5,7,14,21,30,45,60,90,120,180,365])
);
insert into public.document_expiry_reminder_settings(id) values (true) on conflict(id) do nothing;

create table if not exists public.document_expiry_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_kind text not null check (document_kind in ('company_document', 'patient_document')),
  document_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  expiry_date date not null,
  reminder_days integer not null check (reminder_days >= 0),
  notification_id uuid references public.notifications(id) on delete set null,
  delivered_at timestamptz not null default now(),
  unique(document_kind, document_id, recipient_id, expiry_date, reminder_days)
);
create index if not exists document_expiry_deliveries_recipient_idx
  on public.document_expiry_reminder_deliveries(recipient_id, delivered_at desc);

alter table public.document_expiry_reminder_settings enable row level security;
alter table public.document_expiry_reminder_deliveries enable row level security;
grant select, update on public.document_expiry_reminder_settings to authenticated;
grant select on public.document_expiry_reminder_deliveries to authenticated;
grant select, insert, update on public.document_expiry_reminder_settings to service_role;
grant select, insert, update, delete on public.document_expiry_reminder_deliveries to service_role;
revoke all on public.document_expiry_reminder_settings, public.document_expiry_reminder_deliveries from anon;

drop policy if exists "document expiry settings readable" on public.document_expiry_reminder_settings;
create policy "document expiry settings readable" on public.document_expiry_reminder_settings
  for select to authenticated using (public.has_permission('documents.manage'));
drop policy if exists "document expiry settings managed" on public.document_expiry_reminder_settings;
create policy "document expiry settings managed" on public.document_expiry_reminder_settings
  for update to authenticated using (public.has_permission('documents.manage'))
  with check (public.has_permission('documents.manage'));
drop policy if exists "document expiry deliveries own" on public.document_expiry_reminder_deliveries;
create policy "document expiry deliveries own" on public.document_expiry_reminder_deliveries
  for select to authenticated using (recipient_id = (select auth.uid()));

create or replace function public.document_expiry_path(kind text, target_document uuid, target_patient uuid default null)
returns text
language sql stable security definer set search_path = '' as $$
  select case when kind = 'patient_document'
    then '/admin/patients/' || target_patient::text
    else '/admin/documents'
  end
$$;
revoke execute on function public.document_expiry_path(text, uuid, uuid) from public, anon;
grant execute on function public.document_expiry_path(text, uuid, uuid) to authenticated, service_role;

create or replace function public.run_document_expiry_reminders()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  settings public.document_expiry_reminder_settings%rowtype;
  candidate record;
  delivery_id uuid;
  delivered integer := 0;
  business_today date;
  title_text text;
  body_text text;
begin
  select * into settings from public.document_expiry_reminder_settings where id = true;
  if settings.id is null or not settings.enabled then return 0; end if;
  business_today := (now() at time zone settings.timezone)::date;

  -- A recipient is always the authorised uploader. This avoids broadcasting
  -- patient or HR document details. Normal RLS still protects the deep link.
  for candidate in
    select 'company_document'::text as kind, d.id, d.expiry_date, d.uploaded_by recipient_id,
           null::uuid as patient_id
    from public.documents d
    where d.expiry_date is not null and d.archived_at is null and d.uploaded_by is not null
      and d.expiry_date - business_today = any(settings.reminder_days)
    union all
    select 'patient_document'::text, d.id, d.expiry_date, d.uploaded_by, d.patient_id
    from public.patient_documents d
    where d.expiry_date is not null and d.deleted_at is null
      and d.status not in ('archived', 'replaced', 'rejected')
      and d.expiry_date - business_today = any(settings.reminder_days)
  loop
    insert into public.document_expiry_reminder_deliveries
      (document_kind, document_id, recipient_id, expiry_date, reminder_days)
    values (candidate.kind, candidate.id, candidate.recipient_id, candidate.expiry_date,
      candidate.expiry_date - business_today)
    on conflict do nothing returning id into delivery_id;
    if delivery_id is null then continue; end if;

    title_text := case when candidate.expiry_date < business_today then 'Document expired'
      when candidate.expiry_date = business_today then 'Document expires today'
      else 'Document expiry reminder' end;
    body_text := case when candidate.expiry_date < business_today then 'A document has expired.'
      when candidate.expiry_date = business_today then 'A document expires today.'
      else 'A document expires in ' || (candidate.expiry_date - business_today)::text || ' days.' end;
    perform public.notify_user(candidate.recipient_id, title_text, body_text,
      'document_expiry_reminder', candidate.id,
      public.document_expiry_path(candidate.kind, candidate.id, candidate.patient_id), null,
      'documents', 'high', case when candidate.expiry_date <= business_today then 'warning' else 'none' end,
      candidate.expiry_date <= business_today,
      jsonb_build_object('document_kind', candidate.kind, 'document_id', candidate.id,
        'expiry_date', candidate.expiry_date, 'reminder_days', candidate.expiry_date - business_today));
    update public.document_expiry_reminder_deliveries
      set notification_id = (select id from public.notifications where profile_id = candidate.recipient_id
        and type = 'document_expiry_reminder' and related_entity_id = candidate.id order by created_at desc limit 1)
      where id = delivery_id;
    delivered := delivered + 1;
  end loop;
  return delivered;
end $$;
revoke execute on function public.run_document_expiry_reminders() from public, anon, authenticated;
grant execute on function public.run_document_expiry_reminders() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'bsmile-document-expiry-reminders') then
    perform cron.unschedule('bsmile-document-expiry-reminders');
  end if;
  perform cron.schedule('bsmile-document-expiry-reminders', '5 * * * *', 'select public.run_document_expiry_reminders();');
end $$;

notify pgrst, 'reload schema';
