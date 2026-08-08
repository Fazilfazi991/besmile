-- Finance overdue transitions use the same BSmile business day as attendance and scheduling.
create or replace function public.finance_refresh_invoice_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare total numeric; paid numeric; target_invoice uuid := coalesce(new.invoice_id,old.invoice_id); business_today date := (now() at time zone 'Asia/Dubai')::date;
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
notify pgrst, 'reload schema';
