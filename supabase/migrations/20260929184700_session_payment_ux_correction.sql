-- Session fees are charges, not received income. A user with only
-- patient_sessions.create may create the session and its invoice; recording
-- money remains protected by the existing invoice/Finance permission.
create or replace function public.create_patient_session_with_payment(
  target_patient uuid,
  session_at timestamptz,
  target_practitioner uuid,
  target_session_type text,
  target_duration integer,
  target_status text,
  target_session_number integer default null,
  target_follow_up date default null,
  target_summary text default null,
  target_fee numeric default 0,
  received_amount numeric default 0,
  receiving_account uuid default null,
  received_method text default null,
  received_reference text default null,
  request_key uuid default gen_random_uuid()
)
returns public.patient_sessions
language plpgsql
security definer
set search_path=''
as $$
declare
  session_row public.patient_sessions%rowtype;
  invoice_row public.finance_invoices%rowtype;
  patient_row public.patients%rowtype;
  total_paid numeric:=coalesce(received_amount,0);
  request_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if request_key is null then raise exception 'A session operation key is required.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':session:'||request_key::text,0));
  request_payload:=jsonb_build_object(
    'patient_id',target_patient,'session_at',session_at,'practitioner_id',target_practitioner,'session_type',target_session_type,
    'duration',target_duration,'status',target_status,'session_number',target_session_number,'follow_up',target_follow_up,
    'summary',nullif(btrim(target_summary),''),'fee',target_fee,'received',received_amount,'account_id',receiving_account,
    'method',received_method,'reference',nullif(btrim(received_reference),'')
  );
  if not public.has_permission('patient_sessions.create') or not public.patient_care_access(target_patient) then raise exception 'Permission denied for session creation.' using errcode='42501'; end if;
  if total_paid>0 and not (public.has_permission('invoices.manage') or public.has_permission('finance.manage')) then raise exception 'Finance permission is required to record a session payment.' using errcode='42501'; end if;
  select * into patient_row from public.patients where id=target_patient and deleted_at is null and archived_at is null;
  if patient_row.id is null then raise exception 'Active client not found.' using errcode='P0002'; end if;
  select * into session_row from public.patient_sessions where created_by=auth.uid() and idempotency_key=request_key;
  if session_row.id is not null then
    if session_row.idempotency_payload is distinct from request_payload then raise exception 'This operation key was already used for a different session payload.' using errcode='22023'; end if;
    return session_row;
  end if;
  if target_fee is null or target_fee<0 or target_fee>999999999999.99 or scale(target_fee)>2 or total_paid<0 or total_paid>target_fee or scale(total_paid)>2 then raise exception 'Payment must be between zero and the valid session fee.' using errcode='22023'; end if;
  if target_status not in ('scheduled','completed','cancelled','no_show','rescheduled') then raise exception 'Choose a valid session status.'; end if;
  if target_duration is null or target_duration<=0 then raise exception 'Duration must be greater than zero.'; end if;
  if target_practitioner is not null and not exists(
    select 1 from public.profiles profile
    join public.outsourced_doctors clinician on clinician.profile_id=profile.id
    where profile.id=target_practitioner and profile.status='active'
      and clinician.status='active' and clinician.archived_at is null
      and clinician.clinician_type in ('staff_psychologist','psychology_intern')
  ) then raise exception 'Choose an active staff practitioner.'; end if;
  if total_paid>0 and coalesce(received_method,'') not in ('cash','bank_transfer','upi','card') then raise exception 'Choose an approved payment method.' using errcode='22023'; end if;
  if total_paid>0 and not exists(select 1 from public.finance_accounts where id=receiving_account and is_active) then raise exception 'Choose an active receiving account.' using errcode='22023'; end if;

  perform pg_catalog.set_config('bsmile.session_finance_rpc','on',true);
  insert into public.patient_sessions(patient_id,appointment_at,assigned_psychologist_id,session_type,session_number,duration_minutes,attendance_status,follow_up_at,administrative_summary,session_fee,idempotency_key,idempotency_payload,created_by)
  values(target_patient,session_at,target_practitioner,target_session_type,target_session_number,target_duration,target_status,target_follow_up,nullif(btrim(target_summary),''),target_fee,request_key,request_payload,auth.uid())
  returning * into session_row;

  if target_fee>0 then
    insert into public.finance_invoices(invoice_number,patient_id,patient_session_id,customer_name,customer_phone,issue_date,due_date,status,currency,created_by)
    values('SESSION-'||replace(session_row.id::text,'-',''),target_patient,session_row.id,patient_row.full_name,patient_row.phone,(session_at at time zone public.business_timezone())::date,(session_at at time zone public.business_timezone())::date,
      case when total_paid=target_fee then 'paid' when total_paid>0 then 'partially_paid' else 'sent' end,'INR',auth.uid())
    returning * into invoice_row;
    insert into public.finance_invoice_items(invoice_id,description,quantity,rate) values(invoice_row.id,target_session_type,1,target_fee);
    if total_paid>0 then
      insert into public.finance_invoice_payments(invoice_id,account_id,amount,payment_date,payment_method,reference_number,received_by,idempotency_key)
      values(invoice_row.id,receiving_account,total_paid,(session_at at time zone public.business_timezone())::date,received_method,nullif(btrim(received_reference),''),auth.uid(),request_key);
    end if;
    update public.patient_sessions set invoice_id=invoice_row.id where id=session_row.id returning * into session_row;
  end if;
  return session_row;
end
$$;

revoke all on function public.create_patient_session_with_payment(uuid,timestamptz,uuid,text,integer,text,integer,date,text,numeric,numeric,uuid,text,text,uuid) from public,anon;
grant execute on function public.create_patient_session_with_payment(uuid,timestamptz,uuid,text,integer,text,integer,date,text,numeric,numeric,uuid,text,text,uuid) to authenticated;

notify pgrst, 'reload schema';
