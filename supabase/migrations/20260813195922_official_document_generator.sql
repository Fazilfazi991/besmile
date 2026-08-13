-- Batch 1: extend the existing private document center for generated official
-- PDFs. Dynamic body text is deliberately not stored in metadata or audit rows.
alter table public.documents
  add column if not exists source_type text not null default 'uploaded'
    check (source_type in ('uploaded', 'official_generated')),
  add column if not exists document_type text,
  add column if not exists related_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists generated_at timestamptz,
  add column if not exists page_count integer check (page_count is null or page_count > 0),
  add column if not exists official_status text
    check (official_status is null or official_status in ('available', 'superseded', 'revoked'));

create index if not exists documents_official_history_idx
  on public.documents (generated_at desc)
  where source_type = 'official_generated';

create or replace function public.official_document_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'official_generated' then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      auth.uid(),
      case when tg_op = 'INSERT' then 'official_document_generated' else 'official_document_regenerated' end,
      'documents',
      new.id,
      case when tg_op = 'UPDATE' then jsonb_build_object(
        'document_type', old.document_type,
        'related_profile_id', old.related_profile_id,
        'file_name', old.file_name,
        'page_count', old.page_count,
        'status', old.official_status
      ) else null end,
      jsonb_build_object(
        'document_type', new.document_type,
        'related_profile_id', new.related_profile_id,
        'file_name', new.file_name,
        'page_count', new.page_count,
        'status', new.official_status
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.official_document_audit_event() from public, anon, authenticated;
drop trigger if exists documents_official_audit on public.documents;
create trigger documents_official_audit
after insert or update on public.documents
for each row execute function public.official_document_audit_event();

create or replace function public.record_official_document_download(document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.documents%rowtype;
begin
  if auth.uid() is null or not (
    public.has_permission('documents.manage')
    or public.has_permission('documents.employee.manage')
  ) then
    raise exception 'permission denied';
  end if;
  select * into target
  from public.documents
  where id = record_official_document_download.document_id
    and source_type = 'official_generated'
    and official_status = 'available';
  if not found then raise exception 'document unavailable'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (
    auth.uid(), 'official_document_downloaded', 'documents', target.id,
    jsonb_build_object(
      'document_type', target.document_type,
      'related_profile_id', target.related_profile_id,
      'file_name', target.file_name
    )
  );
end;
$$;

revoke all on function public.record_official_document_download(uuid) from public, anon;
grant execute on function public.record_official_document_download(uuid) to authenticated;

create or replace function public.record_official_report_generation(
  report_type text,
  report_context jsonb default '{}'::jsonb,
  generated_pages integer default 0,
  generated_rows integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'permission denied'; end if;
  allowed := case
    when report_type in ('finance_all','finance_income','finance_expense','finance_ledger','finance_invoices','finance_payroll') then public.has_permission('reports.finance.view') or public.has_permission('reports.view')
    when report_type = 'invoice' then public.has_permission('invoices.view') or public.has_permission('invoices.manage')
    when report_type in ('payroll','payslip') then public.has_permission('payroll.view') or public.has_permission('payroll.manage')
    when report_type = 'leads' then public.has_permission('crm.manage_all') or public.has_permission('crm.view_team') or public.has_permission('leads.view')
    when report_type = 'patients' then public.has_permission('patients.view') or public.has_permission('patients.view_all')
    when report_type = 'employees' then public.has_permission('employees.view')
    when report_type = 'attendance' then public.has_permission('attendance.view') or public.has_permission('attendance.manage')
    when report_type = 'leave' then public.has_permission('leave.view') or public.has_permission('leave.manage') or public.has_permission('leave.approve')
    when report_type = 'appointments' then public.has_permission('doctor_scheduling.view') or public.has_permission('appointments.view')
    when report_type = 'documents' then public.has_permission('documents.manage') or public.has_permission('documents.employee.manage') or public.has_permission('patient_documents.view')
    when report_type = 'finance' then public.has_permission('reports.view') or public.has_permission('reports.finance.view') or public.has_permission('finance.view')
    else false
  end;
  if not allowed then raise exception 'permission denied'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (
    auth.uid(), 'official_report_generated', 'official_report', auth.uid(),
    jsonb_build_object(
      'report_type', report_type,
      'context', coalesce(report_context, '{}'::jsonb),
      'page_count', greatest(generated_pages, 0),
      'row_count', greatest(generated_rows, 0)
    )
  );
end;
$$;

revoke all on function public.record_official_report_generation(text,jsonb,integer,integer) from public, anon;
grant execute on function public.record_official_report_generation(text,jsonb,integer,integer) to authenticated;
