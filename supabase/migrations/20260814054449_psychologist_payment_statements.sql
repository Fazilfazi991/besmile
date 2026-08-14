-- Batch 3: immutable official statements built exclusively from the Batch 2
-- payable snapshots. Clinical and client data are deliberately excluded.

create sequence if not exists public.psychologist_payment_statement_number_seq;

create table if not exists public.psychologist_payment_statements (
  id uuid primary key default gen_random_uuid(),
  statement_number text not null unique,
  psychologist_id uuid not null references public.outsourced_doctors(id) on delete restrict,
  psychologist_profile_id uuid references public.profiles(id) on delete set null,
  psychologist_name text not null,
  period_start date not null,
  period_end date not null,
  statement_date date not null default public.business_today(),
  payment_status text not null check (payment_status in ('payment_due', 'paid')),
  session_count integer not null check (session_count > 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  paid_date_from date,
  paid_date_to date,
  payment_references text[] not null default '{}'::text[],
  statement_series_id uuid not null,
  version integer not null default 1 check (version > 0),
  supersedes_statement_id uuid references public.psychologist_payment_statements(id) on delete restrict,
  generation_status text not null default 'prepared' check (generation_status in ('prepared', 'available')),
  document_id uuid unique references public.documents(id) on delete restrict,
  storage_path text unique,
  file_name text,
  file_size bigint check (file_size is null or file_size > 0),
  page_count integer check (page_count is null or page_count > 0),
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (period_end >= period_start),
  unique (statement_series_id, version),
  check ((payment_status = 'paid') = (paid_date_from is not null and paid_date_to is not null)),
  check ((generation_status = 'available') = (document_id is not null and storage_path is not null and file_name is not null and file_size is not null and page_count is not null and finalized_at is not null))
);

create table if not exists public.psychologist_payment_statement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.psychologist_payment_statements(id) on delete cascade,
  payable_id uuid not null references public.psychologist_session_payables(id) on delete restrict,
  appointment_id uuid not null references public.doctor_appointments(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  session_date date not null,
  session_reference text not null,
  due_date date,
  payable_amount numeric(14,2) not null check (payable_amount > 0),
  currency text not null check (currency = 'INR'),
  payable_status text not null check (payable_status in ('payment_due', 'scheduled', 'on_hold', 'paid')),
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  unique (statement_id, payable_id),
  unique (statement_id, line_number),
  check ((payable_status = 'paid') = (paid_at is not null))
);

create index if not exists psychologist_payment_statements_history_idx
  on public.psychologist_payment_statements (psychologist_id, generated_at desc)
  where generation_status = 'available';
create index if not exists psychologist_payment_statement_items_payable_idx
  on public.psychologist_payment_statement_items (payable_id);

alter table public.psychologist_payment_statements enable row level security;
alter table public.psychologist_payment_statement_items enable row level security;

grant select on public.psychologist_payment_statements, public.psychologist_payment_statement_items to authenticated;

create policy "psychologist payment statements authorized read"
on public.psychologist_payment_statements for select to authenticated
using (
  public.has_permission('psychologist_payments.view')
  and (public.has_permission('documents.manage') or public.has_permission('documents.employee.manage'))
  and (generation_status = 'available' or generated_by = (select auth.uid()))
);

create policy "psychologist payment statement items authorized read"
on public.psychologist_payment_statement_items for select to authenticated
using (
  public.has_permission('psychologist_payments.view')
  and (public.has_permission('documents.manage') or public.has_permission('documents.employee.manage'))
  and exists (
    select 1 from public.psychologist_payment_statements statement
    where statement.id = psychologist_payment_statement_items.statement_id
      and (
        statement.generation_status = 'available'
        or (statement.generation_status = 'prepared' and statement.generated_by = (select auth.uid()))
      )
  )
);

create or replace function public.prepare_psychologist_payment_statement(
  target_payable_ids uuid[],
  target_supersedes_statement uuid default null
)
returns public.psychologist_payment_statements
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  selected_count integer;
  selected_psychologists integer;
  selected_currency_count integer;
  selected_min_date date;
  selected_max_date date;
  selected_total numeric(14,2);
  selected_all_paid boolean;
  selected_all_pending boolean;
  selected_paid_from date;
  selected_paid_to date;
  selected_references text[];
  selected_psychologist uuid;
  selected_profile uuid;
  selected_name text;
  prior public.psychologist_payment_statements%rowtype;
  prior_ids uuid[];
  requested_ids uuid[];
  new_statement_id uuid := gen_random_uuid();
  target_series_id uuid;
  next_version integer := 1;
  sequence_value bigint;
  result public.psychologist_payment_statements%rowtype;
begin
  if actor is null
    or not public.has_permission('psychologist_payments.manage')
    or not (public.has_permission('documents.manage') or public.has_permission('documents.employee.manage'))
  then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_payable_ids is null or cardinality(target_payable_ids) < 1 or cardinality(target_payable_ids) > 500 then
    raise exception 'Select between 1 and 500 eligible payables.';
  end if;

  perform 1 from public.psychologist_session_payables payable
  where payable.id = any(target_payable_ids) order by payable.id for share;

  select
    count(*), count(distinct payable.psychologist_id), count(distinct payable.currency),
    min(payable.session_date), max(payable.session_date), sum(payable.payable_amount),
    bool_and(payable.status = 'paid'),
    bool_and(payable.status in ('payment_due', 'scheduled', 'on_hold')),
    min(payable.paid_at)::date, max(payable.paid_at)::date,
    coalesce(array_agg(distinct payable.payment_reference) filter (where payable.payment_reference is not null), '{}'::text[])
  into
    selected_count, selected_psychologists, selected_currency_count,
    selected_min_date, selected_max_date, selected_total,
    selected_all_paid, selected_all_pending,
    selected_paid_from, selected_paid_to, selected_references
  from public.psychologist_session_payables payable
  where payable.id = any(target_payable_ids);

  if selected_count <> cardinality(target_payable_ids) then
    raise exception 'The selection contains duplicate, missing, or inaccessible payables.';
  end if;
  if selected_psychologists <> 1 then raise exception 'All payables must belong to one psychologist.'; end if;
  if selected_currency_count <> 1 then raise exception 'All payables must use one currency.'; end if;
  if not selected_all_paid and not selected_all_pending then
    raise exception 'Paid and pending payables cannot be combined, and cancelled payables are ineligible.';
  end if;

  select payable.psychologist_id, payable.psychologist_profile_id
  into selected_psychologist, selected_profile
  from public.psychologist_session_payables payable
  where payable.id = target_payable_ids[1];

  select doctor.doctor_name into selected_name
  from public.outsourced_doctors doctor where doctor.id = selected_psychologist;
  if nullif(btrim(selected_name), '') is null then raise exception 'Psychologist is unavailable.'; end if;

  select array_agg(id order by id) into requested_ids from unnest(target_payable_ids) id;
  if target_supersedes_statement is not null then
    select * into prior from public.psychologist_payment_statements
    where id = target_supersedes_statement and generation_status = 'available' for update;
    if prior.id is null then raise exception 'The statement to regenerate is unavailable.'; end if;
    select array_agg(item.payable_id order by item.payable_id) into prior_ids
    from public.psychologist_payment_statement_items item where item.statement_id = prior.id;
    if prior.psychologist_id <> selected_psychologist or prior_ids is distinct from requested_ids then
      raise exception 'Regeneration must preserve the exact payable selection.';
    end if;
    target_series_id := prior.statement_series_id;
    perform 1 from public.psychologist_payment_statements
    where statement_series_id = target_series_id for update;
    select coalesce(max(statement.version), 0) + 1 into next_version
    from public.psychologist_payment_statements statement
    where statement.statement_series_id = target_series_id;
  else
    target_series_id := new_statement_id;
  end if;

  sequence_value := nextval('public.psychologist_payment_statement_number_seq'::regclass);
  insert into public.psychologist_payment_statements (
    id, statement_number, psychologist_id, psychologist_profile_id, psychologist_name,
    period_start, period_end, payment_status, session_count, total_amount,
    paid_date_from, paid_date_to, payment_references, statement_series_id, version,
    supersedes_statement_id, generated_by
  ) values (
    new_statement_id,
    'PS-' || extract(year from public.business_today())::integer::text || '-' || lpad(sequence_value::text, 6, '0'),
    selected_psychologist, selected_profile, selected_name,
    selected_min_date, selected_max_date, case when selected_all_paid then 'paid' else 'payment_due' end,
    selected_count, selected_total,
    case when selected_all_paid then selected_paid_from else null end,
    case when selected_all_paid then selected_paid_to else null end,
    case when selected_all_paid then selected_references else '{}'::text[] end, target_series_id,
    next_version, target_supersedes_statement, actor
  ) returning * into result;

  insert into public.psychologist_payment_statement_items (
    statement_id, payable_id, appointment_id, line_number, session_date,
    session_reference, due_date, payable_amount, currency, payable_status,
    paid_at, payment_reference
  )
  select
    result.id, payable.id, payable.appointment_id,
    (row_number() over (order by payable.session_date, payable.id))::integer, payable.session_date,
    'Session #' || upper(left(replace(payable.appointment_id::text, '-', ''), 8)),
    payable.due_date, payable.payable_amount, payable.currency, payable.status,
    payable.paid_at, payable.payment_reference
  from public.psychologist_session_payables payable
  where payable.id = any(target_payable_ids)
  order by payable.session_date, payable.id;

  return result;
end;
$$;

create or replace function public.finalize_psychologist_payment_statement(
  target_statement uuid,
  target_storage_path text,
  target_file_name text,
  target_file_size bigint,
  target_page_count integer
)
returns public.psychologist_payment_statements
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.psychologist_payment_statements%rowtype;
  created_document uuid;
begin
  if actor is null
    or not public.has_permission('psychologist_payments.manage')
    or not (public.has_permission('documents.manage') or public.has_permission('documents.employee.manage'))
  then raise exception 'Permission denied' using errcode = '42501'; end if;
  if target_file_size <= 0 or target_page_count <= 0
    or nullif(btrim(target_storage_path), '') is null
    or nullif(btrim(target_file_name), '') is null
    or target_storage_path not like 'company/' || actor::text || '/official/psychologist-payments/%'
  then raise exception 'Invalid generated document metadata.'; end if;

  select * into target from public.psychologist_payment_statements
  where id = target_statement and generated_by = actor and generation_status = 'prepared' for update;
  if target.id is null then raise exception 'Prepared statement is unavailable.'; end if;

  insert into public.documents (
    title, description, category, storage_path, file_name, mime_type, file_size,
    uploaded_by, source_type, document_type, related_profile_id, generated_at,
    page_count, official_status
  ) values (
    'Psychologist Payment Statement ' || target.statement_number,
    target.psychologist_name || ' · ' || target.period_start::text || ' to ' || target.period_end::text,
    'Official:Psychologist Payment Statement', target_storage_path, target_file_name,
    'application/pdf', target_file_size, actor, 'official_generated',
    'psychologist_payment_statement', target.psychologist_profile_id, now(),
    target_page_count, 'available'
  ) returning id into created_document;

  update public.psychologist_payment_statements set
    generation_status = 'available', document_id = created_document,
    storage_path = target_storage_path, file_name = target_file_name,
    file_size = target_file_size, page_count = target_page_count, finalized_at = now()
  where id = target.id returning * into target;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (
    actor,
    case when target.supersedes_statement_id is null then 'psychologist_payment_statement_generated' else 'psychologist_payment_statement_regenerated' end,
    'psychologist_payment_statements', target.id,
    jsonb_build_object(
      'statement_number', target.statement_number,
      'psychologist_id', target.psychologist_id,
      'period_start', target.period_start,
      'period_end', target.period_end,
      'payable_ids', (select jsonb_agg(item.payable_id order by item.line_number) from public.psychologist_payment_statement_items item where item.statement_id = target.id),
      'session_count', target.session_count,
      'total_amount', target.total_amount,
      'currency', target.currency,
      'payment_status', target.payment_status,
      'supersedes_statement_id', target.supersedes_statement_id,
      'document_id', target.document_id,
      'page_count', target.page_count
    )
  );
  return target;
end;
$$;

create or replace function public.discard_prepared_psychologist_payment_statement(target_statement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.psychologist_payment_statements
  where id = target_statement and generated_by = (select auth.uid()) and generation_status = 'prepared';
end;
$$;

create or replace function public.record_psychologist_payment_statement_download(target_statement uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare target public.psychologist_payment_statements%rowtype;
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.view')
    or not (public.has_permission('documents.manage') or public.has_permission('documents.employee.manage'))
  then raise exception 'Permission denied' using errcode = '42501'; end if;
  select * into target from public.psychologist_payment_statements
  where id = target_statement and generation_status = 'available';
  if target.id is null then raise exception 'Statement unavailable.'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values ((select auth.uid()), 'psychologist_payment_statement_downloaded', 'psychologist_payment_statements', target.id,
    jsonb_build_object('statement_number', target.statement_number, 'document_id', target.document_id, 'file_name', target.file_name));
  return target.storage_path;
end;
$$;

revoke all on function public.prepare_psychologist_payment_statement(uuid[],uuid) from public, anon;
revoke all on function public.finalize_psychologist_payment_statement(uuid,text,text,bigint,integer) from public, anon;
revoke all on function public.discard_prepared_psychologist_payment_statement(uuid) from public, anon;
revoke all on function public.record_psychologist_payment_statement_download(uuid) from public, anon;
grant execute on function public.prepare_psychologist_payment_statement(uuid[],uuid) to authenticated;
grant execute on function public.finalize_psychologist_payment_statement(uuid,text,text,bigint,integer) to authenticated;
grant execute on function public.discard_prepared_psychologist_payment_statement(uuid) to authenticated;
grant execute on function public.record_psychologist_payment_statement_download(uuid) to authenticated;

notify pgrst, 'reload schema';
