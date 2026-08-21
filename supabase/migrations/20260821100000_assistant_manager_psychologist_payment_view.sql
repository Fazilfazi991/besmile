-- Assistant Managers can review and settle the existing online psychologist
-- payment workflow, but cannot configure rates or receive broad Finance access.
-- This uses the canonical direct-permission mechanism because Assistant Manager
-- is a staff designation, not a separate value in public.employee_role.
insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select
  assistant.id,
  permission.id,
  coalesce(
    (
      select manager.id
      from public.profiles manager
      where manager.role::text in ('general_manager', 'General Manager')
      order by manager.created_at
      limit 1
    ),
    assistant.id
  ),
  'Assistant Manager psychologist payment access'
from public.profiles assistant
join public.permissions permission
  on permission.code in ('psychologist_payments.view', 'psychologist_payments.settle')
where assistant.is_employee = true
  and assistant.status::text in ('active', 'intern', 'probation')
  and assistant.role::text = 'staff'
  and assistant.designation = 'Assistant Manager'
  and not exists (
    select 1
    from public.user_permission_grants permission_grant
    where permission_grant.profile_id = assistant.id
      and permission_grant.permission_id = permission.id
      and permission_grant.revoked_at is null
  );

-- Settlement keeps the original atomic finance transaction and audit trail,
-- but its authorization is payment-specific rather than broad Finance access.
create or replace function public.settle_psychologist_session_payable(target_payable uuid, target_account uuid, paid_on date, method text, reference text default null)
returns public.psychologist_session_payables language plpgsql security definer set search_path='' as $$
declare payable public.psychologist_session_payables%rowtype; ledger_id uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('psychologist_payments.settle') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into payable from public.psychologist_session_payables where id=target_payable for update;
  if payable.id is null or payable.status not in ('payment_due','scheduled') or payable.finance_transaction_id is not null then raise exception 'This payable is not available for settlement.'; end if;
  if not exists(select 1 from public.finance_accounts where id=target_account and is_active) then raise exception 'Payment account is unavailable.'; end if;
  if method not in ('cash','bank_transfer','upi','card') then raise exception 'Payment method is unavailable.'; end if;
  insert into public.finance_transactions(transaction_type,account_id,expense_category_id,amount,transaction_date,payment_method,reference_number,description,created_by) select 'psychologist_payment',target_account,id,payable.payable_amount,coalesce(paid_on,public.business_today()),method,nullif(btrim(reference),''),'Psychologist session payable: '||payable.id::text,(select auth.uid()) from public.finance_expense_categories where name='Psychologist session payout' and is_active limit 1 returning id into ledger_id;
  if ledger_id is null then raise exception 'Psychologist session payout expense category is unavailable.'; end if;
  update public.psychologist_session_payables set status='paid',paid_at=coalesce(paid_on,public.business_today())::timestamptz,paid_by=(select auth.uid()),payment_reference=nullif(btrim(reference),''),finance_transaction_id=ledger_id where id=payable.id returning * into payable;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values((select auth.uid()),'psychologist_session_payable_paid','psychologist_session_payables',payable.id,jsonb_build_object('status','payment_due'),jsonb_build_object('status','paid','finance_transaction_id',ledger_id,'amount',payable.payable_amount));
  return payable;
end $$;
revoke all on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) from public, anon;
grant execute on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) to authenticated, service_role;

-- Do not expose Finance account configuration through table RLS.  Settlers
-- receive only active account IDs and names through this narrow selector.
create or replace function public.eligible_psychologist_payment_accounts()
returns table(id uuid, name text)
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.has_permission('psychologist_payments.settle') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return query
  select account.id, account.name
  from public.finance_accounts account
  where account.is_active
  order by account.name;
end $$;
revoke all on function public.eligible_psychologist_payment_accounts() from public, anon;
grant execute on function public.eligible_psychologist_payment_accounts() to authenticated, service_role;

notify pgrst, 'reload schema';
