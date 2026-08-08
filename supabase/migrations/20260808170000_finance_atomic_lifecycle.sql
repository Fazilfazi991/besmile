-- Keep finance payment and payroll settlement changes atomic.
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
 insert into public.finance_invoice_payments(invoice_id,account_id,amount,payment_date,payment_method,reference_number,received_by) values(target_invoice,target_account,payment_amount,coalesce(paid_on,(now() at time zone 'Asia/Dubai')::date),method,nullif(btrim(reference),''),(select auth.uid())) returning * into payment;
 update public.finance_invoices set status=case
   when paid+payment_amount>=total then 'paid'
   when inv.due_date < (now() at time zone 'Asia/Dubai')::date then 'overdue'
   else 'partially_paid'
 end where id=target_invoice;
 return payment;
end $$;
revoke execute on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text) from public,anon; grant execute on function public.record_invoice_payment_atomic(uuid,uuid,numeric,date,text,text) to authenticated,service_role;
