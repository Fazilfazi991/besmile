-- Per-entry payment evidence and ledger linkage for manual payroll payments.
alter table public.payroll_entries add column if not exists payment_date date;
alter table public.payroll_entries add column if not exists payment_method text;
alter table public.payroll_entries add column if not exists payment_reference text;
alter table public.payroll_entries add column if not exists finance_transaction_id uuid references public.finance_transactions(id);
create unique index if not exists payroll_entries_finance_transaction_unique on public.payroll_entries(finance_transaction_id) where finance_transaction_id is not null;

-- One active setting per employee remains the source of truth; inactive rows are
-- retained for the audit trail and excluded when a new payroll run is generated.
alter table public.employee_salary_settings add column if not exists is_active boolean not null default true;

-- Every recorded invoice payment is reflected once in the ledger.  Keeping the
-- link on the payment makes the integration idempotent and traceable.
alter table public.finance_invoice_payments add column if not exists finance_transaction_id uuid references public.finance_transactions(id);
create unique index if not exists finance_invoice_payments_finance_transaction_unique on public.finance_invoice_payments(finance_transaction_id) where finance_transaction_id is not null;

create or replace function public.finance_invoice_payment_ledger() returns trigger language plpgsql security definer set search_path=public as $$
declare ledger_id uuid;
begin
  if new.finance_transaction_id is not null then return new; end if;
  insert into public.finance_transactions (
    transaction_type, account_id, amount, transaction_date, payment_method,
    reference_number, description, created_by
  ) values (
    'invoice_payment', new.account_id, new.amount, new.payment_date,
    new.payment_method, new.reference_number,
    'Invoice payment: ' || (select invoice_number from public.finance_invoices where id=new.invoice_id),
    new.received_by
  ) returning id into ledger_id;
  update public.finance_invoice_payments set finance_transaction_id=ledger_id where id=new.id;
  return new;
end $$;
drop trigger if exists finance_invoice_payment_ledger_trigger on public.finance_invoice_payments;
create trigger finance_invoice_payment_ledger_trigger after insert on public.finance_invoice_payments
for each row execute function public.finance_invoice_payment_ledger();
