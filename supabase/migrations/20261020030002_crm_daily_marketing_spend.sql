-- A narrow entry surface over the existing ledger, with no finance grants.
begin;
-- Existing Finance audit captures actor and full before/after rows. Do not
-- allow this entry path to ship without that audit boundary enabled.
do $$ begin
  if not exists (select 1 from pg_trigger t where t.tgrelid='public.finance_transactions'::regclass
    and t.tgname='finance_transactions_audit' and not t.tgisinternal and t.tgenabled in ('O','A')
    and t.tgfoid='public.finance_audit_event()'::regprocedure) then
    raise exception 'Finance transaction auditing must be enabled before Daily Marketing Spend is released.';
  end if;
end $$;
insert into public.permissions(code, description)
values ('crm.marketing_spend.manage', 'Enter and edit daily Marketing spend totals only')
on conflict(code) do nothing;

alter table public.finance_transactions
  add column if not exists crm_daily_marketing boolean not null default false;
-- Archived daily totals must be restored in Finance, never silently duplicated.
create unique index if not exists finance_crm_daily_marketing_identity
  on public.finance_transactions(transaction_date, expense_subcategory, account_id)
  where crm_daily_marketing;
alter table public.finance_transactions
  add constraint finance_crm_daily_marketing_shape check (
    not crm_daily_marketing or (transaction_type = 'expense' and expense_subcategory is not null)
  );

create or replace function public.can_enter_daily_marketing_spend()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.has_permission('crm.marketing_spend.manage')
    and exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.status in ('active', 'intern', 'probation') and p.is_employee
      and p.removed_at is null and p.login_enabled and p.workforce_visible and not p.onboarding_required)
$$;
revoke all on function public.can_enter_daily_marketing_spend() from public, anon;
grant execute on function public.can_enter_daily_marketing_spend() to authenticated;

-- Only active account names/IDs and the marked totals for one date are exposed.
create or replace function public.daily_marketing_spend_options(business_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_enter_daily_marketing_spend() then
    raise exception 'Daily marketing spend permission required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name), '[]'::jsonb)
      from public.finance_accounts a where a.is_active and a.currency = 'INR'),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'account_id', t.account_id, 'expense_subcategory', t.expense_subcategory,
      'amount', t.amount, 'description', t.description, 'reference_number', t.reference_number,
      'payment_method', t.payment_method, 'updated_at', t.updated_at, 'archived_at', t.archived_at)), '[]'::jsonb)
      from public.finance_transactions t where t.crm_daily_marketing and t.transaction_date = business_date)
  );
end $$;
revoke all on function public.daily_marketing_spend_options(date) from public, anon;
grant execute on function public.daily_marketing_spend_options(date) to authenticated;

create or replace function public.save_daily_marketing_spend(
  business_date date, spend_amount numeric, subtype text, finance_account uuid,
  method text, details text default null, reference text default null,
  expected_updated_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare category_id uuid; existing public.finance_transactions%rowtype; result_id uuid;
begin
  if not public.can_enter_daily_marketing_spend() then
    raise exception 'Daily marketing spend permission required.' using errcode = '42501';
  end if;
  if business_date is null or business_date > (now() at time zone 'Asia/Kolkata')::date
    or spend_amount is null or spend_amount <= 0 or spend_amount > 999999999999.99
    or spend_amount <> round(spend_amount, 2)
    or subtype is null or subtype not in ('Digital Marketing Expenses', 'Performance Marketing Expenses', 'Other Marketing Expenses')
    or method is null or method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Choose a valid business date, positive amount (two decimals), Marketing subtype and payment method.' using errcode = '22023';
  end if;
  if subtype = 'Other Marketing Expenses' and nullif(btrim(details), '') is null then
    raise exception 'Describe Other Marketing Expenses.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.finance_accounts where id = finance_account and is_active and currency = 'INR') then
    raise exception 'Select an active INR finance account.' using errcode = '22023';
  end if;
  select id into category_id from public.finance_expense_categories where name = 'Marketing' and is_active;
  if category_id is null then raise exception 'Marketing expense category is unavailable.'; end if;
  -- Serialize simultaneous creates for the same daily identity, including retries.
  perform pg_advisory_xact_lock(hashtextextended(business_date::text || ':' || subtype || ':' || finance_account::text, 0));
  select * into existing from public.finance_transactions
    where crm_daily_marketing and transaction_date = business_date
      and expense_subcategory = subtype and account_id = finance_account for update;
  if existing.id is not null then
    if existing.archived_at is not null or existing.transaction_type <> 'expense'
      or existing.expense_category_id <> category_id then
      raise exception 'This daily total needs review in Finance before editing.';
    end if;
    -- An identical retry succeeds even when the response to the first save was lost.
    if existing.amount = spend_amount and existing.payment_method = method
      and existing.description is not distinct from nullif(btrim(details), '')
      and existing.reference_number is not distinct from nullif(btrim(reference), '') then
      return existing.id;
    end if;
    if expected_updated_at is null or existing.updated_at <> expected_updated_at then
      raise exception 'Daily spend changed. Reload the total before saving again.' using errcode = '40001';
    end if;
    update public.finance_transactions set amount = spend_amount, payment_method = method,
      description = nullif(btrim(details), ''), reference_number = nullif(btrim(reference), ''), updated_at = clock_timestamp()
      where id = existing.id;
    return existing.id;
  end if;
  if expected_updated_at is not null then
    raise exception 'Daily spend changed. Reload before saving.' using errcode = '40001';
  end if;
  insert into public.finance_transactions(transaction_type, account_id, expense_category_id, amount,
    transaction_date, payment_method, expense_subcategory, description, reference_number, created_by, crm_daily_marketing)
  values ('expense', finance_account, category_id, spend_amount, business_date, method, subtype,
    nullif(btrim(details), ''), nullif(btrim(reference), ''), auth.uid(), true)
  returning id into result_id;
  return result_id;
end $$;
revoke all on function public.save_daily_marketing_spend(date,numeric,text,uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.save_daily_marketing_spend(date,numeric,text,uuid,text,text,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
