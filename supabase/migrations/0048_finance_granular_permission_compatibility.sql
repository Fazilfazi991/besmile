-- Align finance RLS with the granular operational permissions used by the
-- management workspace. Existing accounts and categories are preserved.
-- These inserts are deliberately idempotent: a partially provisioned tenant
-- regains the standard choices without changing existing master data.
insert into public.finance_accounts (name, account_type, is_active)
select item.name, item.account_type, true
from (values ('Cash', 'cash'), ('Primary Bank', 'bank')) as item(name, account_type)
where not exists (select 1 from public.finance_accounts account where lower(account.name) = lower(item.name));

insert into public.finance_income_categories (name, is_active)
select item.name, true
from (values ('Consultation'), ('Session'), ('Service'), ('Product'), ('Other')) as item(name)
where not exists (select 1 from public.finance_income_categories category where lower(category.name) = lower(item.name));

insert into public.finance_expense_categories (name, is_active)
select item.name, true
from (values ('Salary'), ('Rent'), ('Utilities'), ('Marketing'), ('Software'), ('Travel'), ('Office'), ('Other')) as item(name)
where not exists (select 1 from public.finance_expense_categories category where lower(category.name) = lower(item.name));

drop policy if exists "finance accounts view" on public.finance_accounts;
drop policy if exists "finance accounts manage" on public.finance_accounts;
drop policy if exists "finance income categories" on public.finance_income_categories;
drop policy if exists "finance expense categories" on public.finance_expense_categories;
drop policy if exists "finance transactions access" on public.finance_transactions;

create policy "finance accounts granular view" on public.finance_accounts for select to authenticated using(
  public.has_permission('finance.view') or public.has_permission('finance.manage') or public.has_permission('finance.dashboard.view')
  or public.has_permission('income.view') or public.has_permission('income.manage') or public.has_permission('expenses.view') or public.has_permission('expenses.manage')
);
create policy "finance accounts granular manage" on public.finance_accounts for all to authenticated using(public.has_permission('finance.manage')) with check(public.has_permission('finance.manage'));
create policy "finance income categories granular view" on public.finance_income_categories for select to authenticated using(
  public.has_permission('finance.view') or public.has_permission('finance.manage') or public.has_permission('income.view') or public.has_permission('income.manage')
);
create policy "finance expense categories granular view" on public.finance_expense_categories for select to authenticated using(
  public.has_permission('finance.view') or public.has_permission('finance.manage') or public.has_permission('expenses.view') or public.has_permission('expenses.manage')
);
create policy "finance transactions granular read" on public.finance_transactions for select to authenticated using(
  (transaction_type='income' and (public.has_permission('income.view') or public.has_permission('income.manage') or public.has_permission('finance.view') or public.has_permission('finance.manage')))
  or (transaction_type='expense' and (public.has_permission('expenses.view') or public.has_permission('expenses.manage') or public.has_permission('finance.view') or public.has_permission('finance.manage')))
  or (transaction_type='invoice_payment' and (public.has_permission('invoices.view') or public.has_permission('invoices.manage') or public.has_permission('finance.dashboard.view') or public.has_permission('finance.view') or public.has_permission('finance.manage')))
  or (transaction_type='payroll_payment' and (public.has_permission('payroll.view') or public.has_permission('payroll.manage') or public.has_permission('finance.dashboard.view') or public.has_permission('finance.view') or public.has_permission('finance.manage')))
  or (transaction_type='adjustment' and (public.has_permission('finance.dashboard.view') or public.has_permission('finance.view') or public.has_permission('finance.manage')))
);
create policy "finance transactions granular insert" on public.finance_transactions for insert to authenticated with check(
  (transaction_type='income' and public.has_permission('income.manage'))
  or (transaction_type='expense' and public.has_permission('expenses.manage'))
  or (transaction_type='invoice_payment' and public.has_permission('invoices.manage'))
  or (transaction_type='payroll_payment' and public.has_permission('payroll.manage'))
  or public.has_permission('finance.manage')
);
create policy "finance transactions granular update" on public.finance_transactions for update to authenticated using(
  (transaction_type='income' and public.has_permission('income.manage')) or (transaction_type='expense' and public.has_permission('expenses.manage')) or (transaction_type='invoice_payment' and public.has_permission('invoices.manage')) or (transaction_type='payroll_payment' and public.has_permission('payroll.manage')) or public.has_permission('finance.manage')
) with check(
  (transaction_type='income' and public.has_permission('income.manage')) or (transaction_type='expense' and public.has_permission('expenses.manage')) or (transaction_type='invoice_payment' and public.has_permission('invoices.manage')) or (transaction_type='payroll_payment' and public.has_permission('payroll.manage')) or public.has_permission('finance.manage')
);

-- Keep inactive accounts/categories from being referenced even if a client is
-- stale or an API call bypasses the form.
create or replace function public.validate_finance_transaction_master_data() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.finance_accounts where id = new.account_id and is_active) then
    raise exception 'Select an active finance account.';
  end if;
  if new.transaction_type = 'income' and not exists (select 1 from public.finance_income_categories where id = new.income_category_id and is_active) then
    raise exception 'Select an active income category.';
  end if;
  if new.transaction_type = 'expense' and not exists (select 1 from public.finance_expense_categories where id = new.expense_category_id and is_active) then
    raise exception 'Select an active expense category.';
  end if;
  if new.payment_method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Select a valid payment method.';
  end if;
  return new;
end;
$$;
drop trigger if exists finance_transactions_master_data on public.finance_transactions;
create trigger finance_transactions_master_data before insert or update on public.finance_transactions for each row execute function public.validate_finance_transaction_master_data();

drop policy if exists "finance receipt access" on storage.objects;
create policy "finance receipt granular access" on storage.objects for all to authenticated
using (bucket_id='finance-receipts' and (public.has_permission('finance.view') or public.has_permission('finance.manage') or public.has_permission('income.view') or public.has_permission('income.manage') or public.has_permission('expenses.view') or public.has_permission('expenses.manage')))
with check (bucket_id='finance-receipts' and (public.has_permission('finance.manage') or public.has_permission('income.manage') or public.has_permission('expenses.manage')));
