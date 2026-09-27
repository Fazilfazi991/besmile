-- Private replies to staff-authored task progress and daily-work reports. Keep
-- these separate from their parents because those records intentionally have a
-- wider audience (for example, other assignees and delegated task managers).
create table public.staff_report_responses (
  id uuid primary key default gen_random_uuid(),
  task_comment_id uuid references public.task_comments(id) on delete cascade,
  daily_work_update_id uuid references public.daily_work_updates(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete restrict,
  response_text text not null check (char_length(btrim(response_text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_report_responses_one_parent check (num_nonnulls(task_comment_id, daily_work_update_id) = 1)
);

create index staff_report_responses_comment_created_idx
on public.staff_report_responses(task_comment_id, created_at);

create index staff_report_responses_daily_work_created_idx
on public.staff_report_responses(daily_work_update_id, created_at);

alter table public.staff_report_responses enable row level security;

-- The parent report author is the response owner. SECURITY DEFINER is used
-- only to look up that protected parent row; the allowed identities are still
-- checked explicitly against auth.uid() and the canonical stored role.
create or replace function public.can_access_staff_report_response(subject_task_comment uuid, subject_daily_work_update uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select report.author_id as owner_id
      from public.task_comments report
      where subject_task_comment is not null and report.id = subject_task_comment
      union all
      select report.profile_id as owner_id
      from public.daily_work_updates report
      where subject_daily_work_update is not null and report.id = subject_daily_work_update
    ) source
    join public.profiles owner on owner.id = source.owner_id
    where owner.role not in ('chairman', 'director')
      and (
        source.owner_id = (select auth.uid())
        or public.current_role() in ('director', 'chairman')
      )
  )
$$;

revoke all on function public.can_access_staff_report_response(uuid, uuid) from public;
grant execute on function public.can_access_staff_report_response(uuid, uuid) to authenticated;

create policy "staff report responses private participant read"
on public.staff_report_responses for select to authenticated
using (public.can_access_staff_report_response(task_comment_id, daily_work_update_id));

create policy "staff report responses private participant create"
on public.staff_report_responses for insert to authenticated
with check (
  responder_id = (select auth.uid())
  and public.can_access_staff_report_response(task_comment_id, daily_work_update_id)
  and exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.status = 'active'
  )
);

create policy "staff report responses own author update"
on public.staff_report_responses for update to authenticated
using (
  responder_id = (select auth.uid())
  and public.can_access_staff_report_response(task_comment_id, daily_work_update_id)
)
with check (
  responder_id = (select auth.uid())
  and public.can_access_staff_report_response(task_comment_id, daily_work_update_id)
  and exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.status = 'active'
  )
);

create or replace function public.protect_staff_report_response_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.task_comment_id is distinct from old.task_comment_id
    or new.daily_work_update_id is distinct from old.daily_work_update_id
    or new.responder_id is distinct from old.responder_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Response identity cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger staff_report_responses_protect_identity
before update on public.staff_report_responses
for each row execute function public.protect_staff_report_response_identity();

-- Reuse the existing security audit without copying the private response body
-- into a second table with a different visibility model.
create or replace function public.audit_staff_report_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'staff_report_response_created' else 'staff_report_response_updated' end,
    'staff_report_responses',
    new.id,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'task_comment_id', old.task_comment_id,
      'daily_work_update_id', old.daily_work_update_id,
      'responder_id', old.responder_id,
      'updated_at', old.updated_at
    ) end,
    jsonb_build_object(
      'task_comment_id', new.task_comment_id,
      'daily_work_update_id', new.daily_work_update_id,
      'responder_id', new.responder_id,
      'updated_at', new.updated_at
    )
  );
  return new;
end
$$;

revoke all on function public.protect_staff_report_response_identity() from public, anon, authenticated;
revoke all on function public.audit_staff_report_response() from public, anon, authenticated;

create trigger staff_report_responses_audit
after insert or update on public.staff_report_responses
for each row execute function public.audit_staff_report_response();

grant select, insert, update on public.staff_report_responses to authenticated;
revoke all on public.staff_report_responses from anon;
