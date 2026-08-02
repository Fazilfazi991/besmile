-- Restore the standard active finance master data when a production project
-- was created without it. Existing accounts and categories are preserved.
insert into public.finance_accounts (name, account_type, is_active)
select seed.name, seed.account_type, true
from (values ('Cash', 'cash'), ('Primary Bank', 'bank')) as seed(name, account_type)
where not exists (select 1 from public.finance_accounts account where lower(account.name) = lower(seed.name));

insert into public.finance_income_categories (name, is_active)
select seed.name, true
from (values ('Consultation'), ('Session'), ('Service'), ('Product'), ('Other')) as seed(name)
where not exists (select 1 from public.finance_income_categories category where lower(category.name) = lower(seed.name));

insert into public.finance_expense_categories (name, is_active)
select seed.name, true
from (values ('Salary'), ('Rent'), ('Utilities'), ('Marketing'), ('Software'), ('Travel'), ('Office'), ('Other')) as seed(name)
where not exists (select 1 from public.finance_expense_categories category where lower(category.name) = lower(seed.name));
