import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalExpenseCategory, expenseCategoryOrder, orderExpenseOptions } from './expense-categories';

const migration = readFileSync('supabase/migrations/20260925140000_canonical_expense_categories_marketing_types.sql', 'utf8');
const accountId = '10000000-0000-4000-8000-000000000001';
const capitalId = '20000000-0000-4000-8000-000000000001';
const monthlyId = '20000000-0000-4000-8000-000000000002';
const maintenanceId = '20000000-0000-4000-8000-000000000003';
const psychologistId = '20000000-0000-4000-8000-000000000004';

async function fixture(withDestinations = false) {
  const db = new PGlite();
  await db.exec(`
    create table public.finance_accounts(id uuid primary key, is_active boolean not null);
    create table public.finance_income_categories(id uuid primary key, is_active boolean not null);
    create table public.finance_expense_categories(
      id uuid primary key default gen_random_uuid(), name text not null unique, is_active boolean not null default true
    );
    create table public.finance_transactions(
      id uuid primary key, transaction_type text not null, account_id uuid not null references public.finance_accounts(id),
      income_category_id uuid, expense_category_id uuid references public.finance_expense_categories(id),
      amount numeric not null, description text, payment_method text not null default 'cash'
    );
    create function public.validate_finance_transaction_master_data() returns trigger
      language plpgsql as $$ begin return new; end $$;
    create trigger finance_transactions_master_data before insert or update on public.finance_transactions
      for each row execute function public.validate_finance_transaction_master_data();
    insert into public.finance_accounts values ('${accountId}', true);
    insert into public.finance_expense_categories(id, name) values
      ('${capitalId}', 'Capital Expense'),
      ('${monthlyId}', 'Monthly Expense'),
      ('${maintenanceId}', 'Maintenance'),
      ('${psychologistId}', 'Psychologist session payout');
    insert into public.finance_transactions(id, transaction_type, account_id, expense_category_id, amount, description)
    values
      ('30000000-0000-4000-8000-000000000001', 'expense', '${accountId}', '${monthlyId}', 50000, 'Marketing development payment'),
      ('30000000-0000-4000-8000-000000000002', 'expense', '${accountId}', '${maintenanceId}', 15000, 'Maintenance payment');
  `);
  if (withDestinations) {
    await db.exec(`insert into public.finance_expense_categories(id, name) values
      ('20000000-0000-4000-8000-000000000005', 'Capital'),
      ('20000000-0000-4000-8000-000000000006', 'Monthly Expenses')`);
  }
  return db;
}

describe('expense category release migration', () => {
  it('reuses category IDs, keeps historical transactions, and exposes exactly six choices', async () => {
    const db = await fixture();
    try {
      await db.exec(migration);
      await db.exec(migration);
      const categories = await db.query<{ id: string; name: string; is_active: boolean }>(
        'select id, name, is_active from public.finance_expense_categories',
      );
      const active = orderExpenseOptions(categories.rows.filter(row => row.is_active));
      expect(active.map(row => canonicalExpenseCategory(row.name))).toEqual(expenseCategoryOrder);
      expect(categories.rows.find(row => row.id === capitalId)).toMatchObject({ name: 'Capital', is_active: true });
      expect(categories.rows.find(row => row.id === monthlyId)).toMatchObject({ name: 'Monthly Expenses', is_active: true });
      expect(categories.rows.find(row => row.id === maintenanceId)).toMatchObject({ name: 'Maintenance', is_active: false });
      expect(categories.rows.find(row => row.id === psychologistId)).toMatchObject({ name: 'Psychologist session payout', is_active: true });

      const transactions = await db.query<{ id: string; expense_category_id: string; name: string; amount: number }>(`
        select transaction.id, transaction.expense_category_id, category.name, transaction.amount::integer as amount
        from public.finance_transactions transaction
        join public.finance_expense_categories category on category.id = transaction.expense_category_id
        order by transaction.id
      `);
      expect(transactions.rows).toMatchObject([
        { expense_category_id: monthlyId, name: 'Monthly Expenses', amount: 50000 },
        { expense_category_id: maintenanceId, name: 'Maintenance', amount: 15000 },
      ]);
      expect(canonicalExpenseCategory('Maintenance')).toBe('Maintenance');
    } finally { await db.close(); }
  }, 30_000);

  it('keeps legacy rows and foreign keys when destination names already exist', async () => {
    const db = await fixture(true);
    try {
      await db.exec(migration);
      const categories = await db.query<{ name: string; is_active: boolean }>(
        'select name, is_active from public.finance_expense_categories order by name',
      );
      expect(categories.rows.filter(row => row.is_active).map(row => canonicalExpenseCategory(row.name)).sort())
        .toEqual([...expenseCategoryOrder].sort());
      expect(categories.rows).toContainEqual({ name: 'Capital Expense', is_active: false });
      expect(categories.rows).toContainEqual({ name: 'Monthly Expense', is_active: false });
      const oldRows = await db.query<{ expense_category_id: string; name: string }>(`
        select transaction.expense_category_id, category.name from public.finance_transactions transaction
        join public.finance_expense_categories category on category.id = transaction.expense_category_id
        order by transaction.id
      `);
      expect(oldRows.rows[0]).toEqual({ expense_category_id: monthlyId, name: 'Monthly Expense' });
      expect(oldRows.rows[1]).toEqual({ expense_category_id: maintenanceId, name: 'Maintenance' });
    } finally { await db.close(); }
  }, 30_000);

  it('validates new categories and Marketing descriptions while allowing unchanged historical categories on edit', async () => {
    const db = await fixture();
    try {
      await db.exec(migration);
      const marketing = await db.query<{ id: string }>("select id from public.finance_expense_categories where name = 'Marketing'");
      const marketingId = marketing.rows[0].id;
      await expect(db.query(`insert into public.finance_transactions
        (id, transaction_type, account_id, expense_category_id, amount, expense_subcategory, description)
        values ($1, 'expense', $2, $3, 10, 'Other Marketing Expenses', '   ')`,
        ['30000000-0000-4000-8000-000000000003', accountId, marketingId]))
        .rejects.toThrow(/finance_transactions_other_marketing_description_check/);
      await db.query(`insert into public.finance_transactions
        (id, transaction_type, account_id, expense_category_id, amount, expense_subcategory, description)
        values ($1, 'expense', $2, $3, 10, 'Other Marketing Expenses', 'Campaign note')`,
        ['30000000-0000-4000-8000-000000000003', accountId, marketingId]);
      await db.query(`insert into public.finance_transactions
        (id, transaction_type, account_id, expense_category_id, amount, description)
        values ($1, 'psychologist_payment', $2, $3, 10, 'Session payout')`,
        ['30000000-0000-4000-8000-000000000005', accountId, psychologistId]);
      await expect(db.query(`insert into public.finance_transactions
        (id, transaction_type, account_id, expense_category_id, amount, description)
        values ($1, 'expense', $2, $3, 10, 'New maintenance expense')`,
        ['30000000-0000-4000-8000-000000000004', accountId, maintenanceId]))
        .rejects.toThrow(/Select an active expense category/);
      await db.query(`update public.finance_transactions set description = 'Updated historical note'
        where id = '30000000-0000-4000-8000-000000000002'`);
      const historical = await db.query<{ expense_category_id: string; description: string }>(`
        select expense_category_id, description from public.finance_transactions
        where id = '30000000-0000-4000-8000-000000000002'`);
      expect(historical.rows[0]).toEqual({ expense_category_id: maintenanceId, description: 'Updated historical note' });
    } finally { await db.close(); }
  }, 30_000);
});
