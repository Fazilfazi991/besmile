-- Finance master data and transactions follow the granular operational
-- permissions used by the management workspace.
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
