-- Create the invoice header and every line item in one database transaction.
-- This removes the client-side rollback window that could leave an empty
-- invoice behind after an item insert or network failure.
create or replace function public.create_finance_invoice_atomic(
  target_invoice_number text,
  target_client uuid,
  target_customer_name text,
  target_customer_phone text,
  target_customer_email text,
  target_issue_date date,
  target_due_date date,
  target_discount numeric,
  target_tax numeric,
  target_notes text,
  target_status text,
  target_currency text,
  item_rows jsonb
)
returns public.finance_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invoice public.finance_invoices%rowtype;
begin
  if auth.uid() is null or not public.has_permission('invoices.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if nullif(btrim(target_invoice_number), '') is null or nullif(btrim(target_customer_name), '') is null then
    raise exception 'Invoice number and customer name are required.' using errcode = '22023';
  end if;
  if target_due_date is not null and target_due_date < target_issue_date then
    raise exception 'Due date cannot be earlier than the invoice date.' using errcode = '22023';
  end if;
  if coalesce(target_discount, 0) < 0 or coalesce(target_tax, 0) < 0 then
    raise exception 'Tax and discount must be zero or greater.' using errcode = '22023';
  end if;
  if target_status not in ('draft', 'sent') then raise exception 'Choose a valid initial invoice status.' using errcode = '22023'; end if;
  if jsonb_typeof(item_rows) <> 'array' or jsonb_array_length(item_rows) = 0 then
    raise exception 'Add at least one line item.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(item_rows) as item(description text, quantity numeric, rate numeric)
    where nullif(btrim(item.description), '') is null or item.quantity <= 0 or item.rate < 0
  ) then
    raise exception 'Each line item needs a description, positive quantity, and non-negative rate.' using errcode = '22023';
  end if;

  insert into public.finance_invoices(
    invoice_number, client_id, customer_name, customer_phone, customer_email,
    issue_date, due_date, discount, tax, notes, status, currency, created_by
  ) values (
    btrim(target_invoice_number), target_client, btrim(target_customer_name), nullif(btrim(target_customer_phone), ''),
    nullif(btrim(target_customer_email), ''), target_issue_date, target_due_date, coalesce(target_discount, 0),
    coalesce(target_tax, 0), nullif(btrim(target_notes), ''), target_status, coalesce(nullif(target_currency, ''), 'INR'), auth.uid()
  ) returning * into created_invoice;

  insert into public.finance_invoice_items(invoice_id, description, quantity, rate)
  select created_invoice.id, btrim(item.description), item.quantity, item.rate
  from jsonb_to_recordset(item_rows) as item(description text, quantity numeric, rate numeric);

  return created_invoice;
end;
$$;

revoke all on function public.create_finance_invoice_atomic(text,uuid,text,text,text,date,date,numeric,numeric,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_finance_invoice_atomic(text,uuid,text,text,text,date,date,numeric,numeric,text,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
