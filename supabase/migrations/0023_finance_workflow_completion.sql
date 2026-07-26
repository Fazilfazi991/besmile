-- Additive completion for the Finance MVP. Run after 0022.
alter table public.finance_transactions add column if not exists counterparty_name text;
alter table public.finance_invoices add column if not exists customer_phone text;
alter table public.finance_invoices add column if not exists customer_email text;
alter table public.finance_invoice_payments add column if not exists notes text;
alter table public.employee_salary_settings add column if not exists effective_date date not null default current_date;

insert into storage.buckets(id,name,public) values ('finance-receipts','finance-receipts',false) on conflict(id) do nothing;
drop policy if exists "finance receipt access" on storage.objects;
create policy "finance receipt access" on storage.objects for all to authenticated
using (bucket_id='finance-receipts' and (public.has_permission('finance.view') or public.has_permission('finance.manage')))
with check (bucket_id='finance-receipts' and public.has_permission('finance.manage'));

create or replace function public.finance_prevent_overpayment() returns trigger language plpgsql security definer set search_path=public as $$
declare outstanding numeric;
begin
  select public.finance_invoice_total(new.invoice_id)-public.finance_invoice_paid(new.invoice_id) into outstanding;
  if new.amount>outstanding then raise exception 'Payment cannot exceed the outstanding invoice amount'; end if;
  return new;
end $$;
drop trigger if exists finance_invoice_prevent_overpayment on public.finance_invoice_payments;
create trigger finance_invoice_prevent_overpayment before insert on public.finance_invoice_payments for each row execute function public.finance_prevent_overpayment();

create or replace function public.finance_audit_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when TG_OP='INSERT' then TG_TABLE_NAME||'_created' when TG_OP='DELETE' then TG_TABLE_NAME||'_deleted' else TG_TABLE_NAME||'_updated' end,TG_TABLE_NAME,coalesce(new.id,old.id),case when TG_OP='INSERT' then null else to_jsonb(old) end,case when TG_OP='DELETE' then null else to_jsonb(new) end);
  return coalesce(new,old);
end $$;
do $$ declare item text; begin foreach item in array array['finance_transactions','finance_invoices','finance_invoice_payments','employee_salary_settings','payroll_runs','payroll_entries'] loop execute format('drop trigger if exists %I on public.%I',item||'_audit',item); execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit_event()',item||'_audit',item); end loop; end $$;
