-- Add the requested category choices without rewriting historical transactions.
insert into public.finance_expense_categories (name, is_active)
select category.name, true
from (values ('Operations'), ('Salaries'), ('Marketing'), ('Admin & Utilities'), ('Capital'), ('Other')) as category(name)
where not exists (
  select 1 from public.finance_expense_categories existing
  where lower(existing.name) = lower(category.name)
);

update public.finance_expense_categories
set is_active = true
where name in ('Operations', 'Salaries', 'Marketing', 'Admin & Utilities', 'Capital', 'Other')
  and is_active = false;

alter table public.finance_transactions
  add column if not exists expense_subcategory text;

alter table public.finance_transactions
  add constraint finance_transactions_marketing_subcategory_check
  check (expense_subcategory is null or expense_subcategory in (
    'Digital Marketing Expenses',
    'Performance Marketing Expenses',
    'Other Marketing Expenses'
  ));

alter table public.finance_transactions
  add constraint finance_transactions_other_marketing_description_check
  check (expense_subcategory is distinct from 'Other Marketing Expenses' or nullif(btrim(description), '') is not null);
