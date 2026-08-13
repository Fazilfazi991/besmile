-- Performance batch one: collapse high-frequency permission checks and return
-- bounded dashboard/chat summaries while preserving the caller's RLS context.

create or replace function public.granted_permissions(permission_codes text[])
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select requested_code
  from unnest(coalesce(permission_codes, array[]::text[])) requested_code
  where public.has_permission(requested_code)
$$;

revoke all on function public.granted_permissions(text[]) from public, anon;
grant execute on function public.granted_permissions(text[]) to authenticated;

create or replace function public.chat_conversation_summaries()
returns table(
  conversation_id uuid,
  last_read_at timestamptz,
  chat_conversations jsonb,
  latest_message jsonb,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    membership.conversation_id,
    membership.last_read_at,
    to_jsonb(conversation) || jsonb_build_object(
      'chat_members', coalesce(member_rows.members, '[]'::jsonb)
    ),
    latest.message,
    coalesce(unread.total, 0)
  from public.chat_members membership
  join public.chat_conversations conversation
    on conversation.id = membership.conversation_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'profile_id', member.profile_id,
        'profiles', jsonb_build_object(
          'full_name', profile.full_name,
          'email', profile.email,
          'designation', profile.designation,
          'department', case when department.id is null then null else jsonb_build_object('name', department.name) end,
          'avatar_url', profile.avatar_url,
          'status', profile.status
        )
      ) order by profile.full_name
    ) as members
    from public.chat_members member
    join public.profiles profile on profile.id = member.profile_id
    left join public.departments department on department.id = profile.department_id
    where member.conversation_id = membership.conversation_id
  ) member_rows on true
  left join lateral (
    select jsonb_build_object(
      'id', message.id,
      'conversation_id', message.conversation_id,
      'body', message.body,
      'message_type', message.message_type,
      'voice_duration_seconds', message.voice_duration_seconds,
      'attachment_name', message.attachment_name,
      'created_at', message.created_at,
      'sender_id', message.sender_id
    ) as message
    from public.chat_messages message
    where message.conversation_id = membership.conversation_id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*) as total
    from public.chat_messages message
    where message.conversation_id = membership.conversation_id
      and message.sender_id <> auth.uid()
      and (
        membership.last_read_at is null
        or message.created_at > membership.last_read_at
      )
  ) unread on true
  where membership.profile_id = auth.uid()
  order by
    conversation.is_system_group desc,
    (conversation.conversation_type = 'group') desc,
    (latest.message ->> 'created_at')::timestamptz desc nulls last
$$;

revoke all on function public.chat_conversation_summaries() from public, anon;
grant execute on function public.chat_conversation_summaries() to authenticated;

create index if not exists chat_messages_conversation_created_id_idx
  on public.chat_messages(conversation_id, created_at desc, id desc);

create or replace function public.crm_dashboard_summary(period_start date, period_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_leads as (
    select
      lead.id,
      coalesce(lead.lead_date, lead.created_at::date) as opened_on,
      lead.converted_at::date as converted_on,
      lead.status_id,
      status.name as status_name,
      lead.source_id,
      source.name as source_name
    from public.crm_leads lead
    left join public.crm_lead_statuses status on status.id = lead.status_id
    left join public.crm_lead_sources source on source.id = lead.source_id
    where lead.archived_at is null
  ), period_leads as (
    select * from visible_leads
    where opened_on between period_start and period_end
  ), converted_leads as (
    select * from visible_leads
    where converted_on between period_start and period_end
  ), daily_rows as (
    select day,
      count(*) filter (where kind = 'lead')::integer as leads,
      count(*) filter (where kind = 'converted')::integer as converted
    from (
      select opened_on as day, 'lead'::text as kind from period_leads
      union all
      select converted_on as day, 'converted'::text as kind from converted_leads
    ) activity
    group by day
    order by day
  ), status_rows as (
    select coalesce(status_name, 'Unassigned') as name, count(*)::integer as count
    from period_leads group by coalesce(status_name, 'Unassigned')
  ), source_rows as (
    select coalesce(source_name, 'Unassigned') as name, count(*)::integer as count
    from period_leads group by coalesce(source_name, 'Unassigned')
  ), followup_counts as (
    select
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date = (now() at time zone 'Asia/Kolkata')::date)::integer as due,
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date < (now() at time zone 'Asia/Kolkata')::date)::integer as overdue,
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date > (now() at time zone 'Asia/Kolkata')::date)::integer as upcoming,
      count(*) filter (where followup.outcome is not null and followup.created_at::date between period_start and period_end)::integer as completed
    from public.crm_lead_followups followup
    join visible_leads lead on lead.id = followup.lead_id
  ), finance_permission as (
    select public.has_permission('finance.dashboard.view') or public.has_permission('finance.view') as allowed
  ), finance_totals as (
    select
      coalesce(sum(transaction.amount) filter (where transaction.transaction_type in ('income', 'invoice_payment')), 0) as revenue,
      coalesce(sum(transaction.amount) filter (where transaction.transaction_type in ('expense', 'payroll_payment')), 0) as expenses
    from public.finance_transactions transaction, finance_permission permission
    where permission.allowed
      and transaction.archived_at is null
      and transaction.transaction_date::date between period_start and period_end
  )
  select jsonb_build_object(
    'periodLeads', (select count(*) from period_leads),
    'converted', (select count(*) from converted_leads),
    'contacted', (select count(*) from period_leads where status_name ~* 'contact'),
    'assessment', (select count(*) from period_leads where status_name ~* 'assessment'),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'leads', leads, 'converted', converted) order by day) from daily_rows), '[]'::jsonb),
    'statuses', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count) order by name) from status_rows), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count) order by name) from source_rows), '[]'::jsonb),
    'followups', jsonb_build_object(
      'due', coalesce((select due from followup_counts), 0),
      'overdue', coalesce((select overdue from followup_counts), 0),
      'upcoming', coalesce((select upcoming from followup_counts), 0),
      'completed', coalesce((select completed from followup_counts), 0)
    ),
    'financeAllowed', (select allowed from finance_permission),
    'revenue', coalesce((select revenue from finance_totals), 0),
    'expenses', coalesce((select expenses from finance_totals), 0)
  )
$$;

revoke all on function public.crm_dashboard_summary(date, date) from public, anon;
grant execute on function public.crm_dashboard_summary(date, date) to authenticated;
