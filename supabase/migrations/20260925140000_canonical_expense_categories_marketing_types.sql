begin;

-- Reuse the existing category IDs when their new names are available. If a
-- destination name already exists, leave the legacy row (and its transaction
-- references) in place; it becomes inactive below.
update public.finance_expense_categories legacy
set name = 'Capital'
where legacy.name = 'Capital Expense'
  and not exists (
    select 1 from public.finance_expense_categories destination
    where lower(destination.name) = lower('Capital')
  );

update public.finance_expense_categories legacy
set name = 'Monthly Expenses'
where legacy.name = 'Monthly Expense'
  and not exists (
    select 1 from public.finance_expense_categories destination
    where lower(destination.name) = lower('Monthly Expenses')
  );

-- Keep the psychologist category's stored spelling: the existing settlement
-- RPCs look it up by this exact name. The Finance UI displays title case.
insert into public.finance_expense_categories (name, is_active)
select category.name, true
from (values
  ('Capital'),
  ('Monthly Expenses'),
  ('Marketing'),
  ('Admin & Utilities'),
  ('Psychologist session payout'),
  ('Other')
) as category(name)
where not exists (
  select 1 from public.finance_expense_categories existing
  where existing.name = category.name
);

-- Deactivation removes legacy choices from new entries without deleting any
-- category or changing any finance_transactions.expense_category_id value.
update public.finance_expense_categories
set is_active = name in (
  'Capital', 'Monthly Expenses', 'Marketing', 'Admin & Utilities',
  'Psychologist session payout', 'Other'
)
where is_active is distinct from (name in (
  'Capital', 'Monthly Expenses', 'Marketing', 'Admin & Utilities',
  'Psychologist session payout', 'Other'
));

alter table public.finance_transactions
  add column if not exists expense_subcategory text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.finance_transactions'::regclass
      and conname = 'finance_transactions_marketing_subcategory_check'
  ) then
    alter table public.finance_transactions
      add constraint finance_transactions_marketing_subcategory_check
      check (expense_subcategory is null or expense_subcategory in (
        'Digital Marketing Expenses',
        'Performance Marketing Expenses',
        'Other Marketing Expenses'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.finance_transactions'::regclass
      and conname = 'finance_transactions_other_marketing_description_check'
  ) then
    alter table public.finance_transactions
      add constraint finance_transactions_other_marketing_description_check
      check (
        expense_subcategory is distinct from 'Other Marketing Expenses'
        or nullif(btrim(description), '') is not null
      );
  end if;
end;
$$;

-- Accept the six current choices. Existing transactions can still be edited
-- without silently changing their historical, now-inactive category.
create or replace function public.validate_finance_transaction_master_data()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if not exists (
    select 1 from public.finance_accounts
    where id = new.account_id and is_active
  ) then
    raise exception 'Select an active finance account.';
  end if;

  if new.transaction_type = 'income' and not exists (
    select 1 from public.finance_income_categories
    where id = new.income_category_id and is_active
  ) then
    raise exception 'Select an active income category.';
  end if;

  if new.transaction_type in ('expense', 'payroll_payment') and not exists (
    select 1 from public.finance_expense_categories
    where id = new.expense_category_id
      and is_active
      and name in (
        'Capital', 'Monthly Expenses', 'Marketing', 'Admin & Utilities',
        'Psychologist session payout', 'Other'
      )
  ) then
    if tg_op <> 'UPDATE' then
      raise exception 'Select an active expense category.';
    end if;
    if old.transaction_type is distinct from new.transaction_type
      or old.expense_category_id is distinct from new.expense_category_id
      or not exists (
        select 1 from public.finance_expense_categories
        where id = new.expense_category_id
      ) then
      raise exception 'Select an active expense category.';
    end if;
  end if;

  if new.transaction_type = 'psychologist_payment' and not exists (
    select 1 from public.finance_expense_categories
    where id = new.expense_category_id
      and is_active
      and name = 'Psychologist session payout'
  ) then
    raise exception 'Psychologist session payout expense category is unavailable.';
  end if;

  if new.payment_method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Select a valid payment method.';
  end if;

  return new;
end;
$$;

commit;
