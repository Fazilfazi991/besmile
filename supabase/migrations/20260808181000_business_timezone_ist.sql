-- BSmile operates in Kerala. Keep business-date calculations tied to the company setting.
insert into public.company_attendance_settings(id, timezone)
values (true, 'Asia/Kolkata')
on conflict (id) do update set timezone = excluded.timezone;

create or replace function public.business_timezone()
returns text language sql stable security definer set search_path='' as $$
  select coalesce((select timezone from public.company_attendance_settings where id=true), 'Asia/Kolkata')
$$;

create or replace function public.business_today()
returns date language sql stable security definer set search_path='' as $$
  select (now() at time zone public.business_timezone())::date
$$;

alter table public.document_expiry_reminder_settings
  alter column timezone set default 'Asia/Kolkata';
update public.document_expiry_reminder_settings set timezone='Asia/Kolkata' where timezone is distinct from 'Asia/Kolkata';

create or replace function public.finance_refresh_invoice_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare total numeric; paid numeric; target_invoice uuid := coalesce(new.invoice_id,old.invoice_id); business_today date := public.business_today();
begin
 select public.finance_invoice_total(target_invoice), public.finance_invoice_paid(target_invoice) into total,paid;
 update public.finance_invoices set status=case
   when status='cancelled' then 'cancelled'
   when paid>=total and total>0 then 'paid'
   when paid>0 then case when due_date < business_today then 'overdue' else 'partially_paid' end
   when due_date < business_today then 'overdue'
   else status end where id=target_invoice;
 return coalesce(new,old);
end $$;

create or replace function public.record_invoice_payment_atomic(target_invoice uuid, target_account uuid, payment_amount numeric, paid_on date, method text, reference text default null)
returns public.finance_invoice_payments language plpgsql security definer set search_path='' as $$
declare inv public.finance_invoices%rowtype; total numeric; paid numeric; payment public.finance_invoice_payments%rowtype;
begin
 if (select auth.uid()) is null or not public.has_permission('invoices.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 if payment_amount is null or payment_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
 select * into inv from public.finance_invoices where id=target_invoice and archived_at is null for update;
 if inv.id is null or inv.status in ('cancelled','paid') then raise exception 'Invoice is not collectible.'; end if;
 select coalesce(sum(quantity*rate),0)+inv.tax-inv.discount into total from public.finance_invoice_items where invoice_id=target_invoice;
 select coalesce(sum(amount),0) into paid from public.finance_invoice_payments where invoice_id=target_invoice;
 if payment_amount > total-paid then raise exception 'Payment exceeds the outstanding balance.'; end if;
 insert into public.finance_invoice_payments(invoice_id,account_id,amount,payment_date,payment_method,reference_number,received_by) values(target_invoice,target_account,payment_amount,coalesce(paid_on,public.business_today()),method,nullif(btrim(reference),''),(select auth.uid())) returning * into payment;
 update public.finance_invoices set status=case when paid+payment_amount>=total then 'paid' when inv.due_date < public.business_today() then 'overdue' else 'partially_paid' end where id=target_invoice;
 return payment;
end $$;

create or replace function public.doctor_slot_is_available(target_doctor uuid, proposed_start timestamptz, proposed_end timestamptz, ignored_appointment uuid default null)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare app_timezone text := public.business_timezone(); local_start timestamp; local_end timestamp; local_day integer;
begin
  local_start := proposed_start at time zone app_timezone;
  local_end := proposed_end at time zone app_timezone;
  local_day := extract(dow from local_start)::integer;
  return proposed_start > now() and proposed_start < proposed_end
    and exists (select 1 from public.outsourced_doctors doctor where doctor.id=target_doctor and doctor.status='active')
    and exists (select 1 from public.doctor_weekly_availability availability where availability.doctor_id=target_doctor and availability.day_of_week=local_day and local_start::time>=availability.start_time and local_end::time<=availability.end_time)
    and not exists (select 1 from public.doctor_blocked_periods blocked where blocked.doctor_id=target_doctor and blocked.blocked_date=local_start::date and (blocked.start_time is null or tstzrange((blocked.blocked_date+blocked.start_time) at time zone app_timezone,(blocked.blocked_date+blocked.end_time) at time zone app_timezone,'[)') && tstzrange(proposed_start,proposed_end,'[)')))
    and not exists (select 1 from public.doctor_appointments appointment where appointment.doctor_id=target_doctor and appointment.deleted_at is null and appointment.status in ('scheduled','confirmed','completed','rescheduled','no_show') and (ignored_appointment is null or appointment.id<>ignored_appointment) and tstzrange(appointment.start_at,appointment.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)'));
end $$;

notify pgrst, 'reload schema';
