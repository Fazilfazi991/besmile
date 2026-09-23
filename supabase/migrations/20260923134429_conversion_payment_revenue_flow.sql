-- Future CRM sale conversions now create their invoice and optional receipt in
-- one database transaction. Existing sales are deliberately not backfilled.

-- The live Sales Coordinator bundle has lead editing but no sale or Finance
-- authority. Keep that boundary: only existing invoice/Finance managers may
-- record money during conversion.

alter table public.finance_invoices
  add column if not exists sale_id uuid references public.crm_sales(id) on delete restrict,
  add column if not exists patient_id uuid references public.patients(id) on delete set null;

create unique index if not exists finance_invoices_sale_unique
on public.finance_invoices(sale_id)
where sale_id is not null;

alter table public.finance_invoice_payments
  add column if not exists conversion_sale_id uuid references public.crm_sales(id) on delete restrict;

create unique index if not exists finance_invoice_payments_conversion_sale_unique
on public.finance_invoice_payments(conversion_sale_id)
where conversion_sale_id is not null;

alter table public.finance_transactions
  add column if not exists invoice_id uuid references public.finance_invoices(id) on delete set null,
  add column if not exists patient_id uuid references public.patients(id) on delete set null;

create index if not exists finance_transactions_invoice_idx
on public.finance_transactions(invoice_id)
where invoice_id is not null;

create or replace function public.finance_invoice_payment_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_id uuid;
  invoice_row public.finance_invoices%rowtype;
begin
  if new.finance_transaction_id is not null then
    return new;
  end if;

  select * into invoice_row
  from public.finance_invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Invoice payment has no invoice.' using errcode = '23503';
  end if;

  insert into public.finance_transactions(
    transaction_type, account_id, amount, transaction_date, payment_method,
    reference_number, description, sale_id, invoice_id, patient_id, created_by
  ) values (
    'invoice_payment', new.account_id, new.amount, new.payment_date,
    new.payment_method, new.reference_number,
    'Invoice payment: ' || invoice_row.invoice_number,
    invoice_row.sale_id, invoice_row.id, invoice_row.patient_id, new.received_by
  )
  returning id into ledger_id;

  update public.finance_invoice_payments
  set finance_transaction_id = ledger_id
  where id = new.id;

  return new;
end
$$;

-- Expose only active account identity needed by the conversion form. Account
-- balances and the rest of Finance remain protected by their existing RLS.
create or replace function public.conversion_receiving_accounts()
returns table(id uuid, name text, account_type text)
language sql
stable
security definer
set search_path = public
as $$
  select account.id, account.name, account.account_type
  from public.finance_accounts account
  where account.is_active
    and auth.uid() is not null
    and (
      public.has_permission('invoices.manage')
      or public.has_permission('finance.manage')
    )
  order by account.name
$$;

revoke all on function public.conversion_receiving_accounts() from public, anon;
grant execute on function public.conversion_receiving_accounts() to authenticated;

create or replace function public.convert_crm_lead_to_sale_with_payment(
  target_lead uuid,
  sale_amount numeric,
  payment_received numeric default 0,
  receiving_account uuid default null,
  payment_method text default null,
  payment_date date default null,
  payment_reference text default null,
  invoice_due_date date default null,
  sale_currency text default 'INR',
  sale_closing_date date default current_date,
  sale_service_details text default null,
  sale_first_session_date date default null,
  sale_second_session_date date default null,
  sale_third_session_date date default null,
  sale_notes text default null
)
returns public.crm_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.crm_leads%rowtype;
  sale_row public.crm_sales%rowtype;
  invoice_row public.finance_invoices%rowtype;
  paid_amount numeric := coalesce(payment_received, 0);
  balance_due numeric;
  effective_closing_date date := coalesce(sale_closing_date, public.business_today());
  invoice_status text;
begin
  if auth.uid() is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if sale_amount is null or sale_amount < 0 then
    raise exception 'Sale amount must be zero or greater.' using errcode = '22023';
  end if;
  if paid_amount < 0 then
    raise exception 'Payment received must be zero or greater.' using errcode = '22023';
  end if;
  if paid_amount > sale_amount then
    raise exception 'Payment received cannot exceed the sale amount.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(sale_currency, '')), '') is null then
    raise exception 'Sale currency is required.' using errcode = '22023';
  end if;

  balance_due := sale_amount - paid_amount;
  if balance_due > 0 and invoice_due_date is null then
    raise exception 'Invoice due date is required when a balance remains.' using errcode = '22023';
  end if;
  if invoice_due_date is not null and invoice_due_date < effective_closing_date then
    raise exception 'Invoice due date cannot be earlier than the sale date.' using errcode = '22023';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead and archived_at is null
  for update;

  if not found
    or not public.crm_lead_can_edit(lead_row.assigned_to)
    or not (public.has_permission('crm.manage_all') or public.has_permission('sales.edit'))
  then
    raise exception 'Permission denied for lead conversion' using errcode = '42501';
  end if;

  select * into sale_row
  from public.crm_sales
  where lead_id = target_lead;

  -- A retry returns the original sale and never creates another financial row.
  if found then
    return sale_row;
  end if;

  if paid_amount > 0 then
    if not (
      public.has_permission('invoices.manage')
      or public.has_permission('finance.manage')
    ) then
      raise exception 'Permission denied for recording payment' using errcode = '42501';
    end if;
    if receiving_account is null or not exists(
      select 1 from public.finance_accounts
      where id = receiving_account and is_active
    ) then
      raise exception 'Choose an active receiving account.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(payment_method, '')), '') is null then
      raise exception 'Payment method is required.' using errcode = '22023';
    end if;
  end if;

  insert into public.crm_sales(
    lead_id, closing_date, sale_value, currency, service_details,
    first_session_date, second_session_date, third_session_date, notes, created_by
  ) values (
    target_lead, effective_closing_date, sale_amount, upper(btrim(sale_currency)),
    nullif(btrim(coalesce(sale_service_details, '')), ''),
    sale_first_session_date, sale_second_session_date, sale_third_session_date,
    nullif(btrim(coalesce(sale_notes, '')), ''), auth.uid()
  )
  returning * into sale_row;

  invoice_status := case
    when paid_amount >= sale_amount and sale_amount > 0 then 'paid'
    when paid_amount > 0 then 'partially_paid'
    when invoice_due_date < public.business_today() then 'overdue'
    else 'sent'
  end;

  insert into public.finance_invoices(
    invoice_number, sale_id, patient_id, customer_name, customer_phone,
    issue_date, due_date, discount, tax, notes, status, currency, created_by
  ) values (
    'SALE-' || replace(sale_row.id::text, '-', ''),
    sale_row.id, lead_row.converted_patient_id, lead_row.full_name, lead_row.phone,
    effective_closing_date, invoice_due_date, 0, 0,
    nullif(btrim(coalesce(sale_notes, '')), ''), invoice_status,
    upper(btrim(sale_currency)), auth.uid()
  )
  returning * into invoice_row;

  insert into public.finance_invoice_items(invoice_id, description, quantity, rate)
  values(
    invoice_row.id,
    coalesce(nullif(btrim(coalesce(sale_service_details, '')), ''), 'CRM sale'),
    1,
    sale_amount
  );

  if paid_amount > 0 then
    insert into public.finance_invoice_payments(
      invoice_id, account_id, amount, payment_date, payment_method,
      reference_number, received_by, conversion_sale_id
    ) values (
      invoice_row.id, receiving_account, paid_amount,
      coalesce(payment_date, public.business_today()), btrim(payment_method),
      nullif(btrim(coalesce(payment_reference, '')), ''), auth.uid(), sale_row.id
    );
  end if;

  -- Keep the lifecycle explicit after the item/payment triggers have run.
  update public.finance_invoices
  set status = invoice_status, updated_at = now()
  where id = invoice_row.id;

  update public.crm_leads
  set converted_at = coalesce(converted_at, now()), updated_at = now()
  where id = target_lead;

  return sale_row;
end
$$;

revoke all on function public.convert_crm_lead_to_sale_with_payment(
  uuid,numeric,numeric,uuid,text,date,text,date,text,date,text,date,date,date,text
) from public, anon;
grant execute on function public.convert_crm_lead_to_sale_with_payment(
  uuid,numeric,numeric,uuid,text,date,text,date,text,date,text,date,date,date,text
) to authenticated;

-- Preserve the old callable contract for stale clients, but route it through
-- the same atomic lifecycle as an unpaid conversion instead of bypassing it.
create or replace function public.convert_crm_lead_to_sale(
  target_lead uuid,
  sale_amount numeric,
  sale_currency text default 'INR',
  sale_closing_date date default current_date,
  sale_service_details text default null,
  sale_first_session_date date default null,
  sale_second_session_date date default null,
  sale_third_session_date date default null,
  sale_notes text default null
)
returns public.crm_sales
language sql
security invoker
set search_path = public
as $$
  select public.convert_crm_lead_to_sale_with_payment(
    target_lead => target_lead,
    sale_amount => sale_amount,
    payment_received => 0,
    invoice_due_date => coalesce(sale_closing_date, public.business_today()),
    sale_currency => sale_currency,
    sale_closing_date => sale_closing_date,
    sale_service_details => sale_service_details,
    sale_first_session_date => sale_first_session_date,
    sale_second_session_date => sale_second_session_date,
    sale_third_session_date => sale_third_session_date,
    sale_notes => sale_notes
  )
$$;

notify pgrst, 'reload schema';
