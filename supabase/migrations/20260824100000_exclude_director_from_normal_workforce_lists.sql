-- Director remains an active management account.  This only narrows the
-- employee-facing recipient directory used by normal staff selectors.
create or replace function public.chat_recipient_search(search_text text default '')
returns table(id uuid, full_name text, designation text, avatar_url text, department_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.designation, p.avatar_url, d.name
  from public.profiles p left join public.departments d on d.id = p.department_id
  where auth.uid() is not null
    and public.has_permission('chat.use')
    and p.id <> auth.uid()
    and p.is_employee = true
    and p.role <> 'director'
    and p.status::text in ('active', 'intern', 'probation')
    and public.has_permission('chat.use', p.id)
    and (coalesce(trim(search_text), '') = '' or p.full_name ilike '%' || trim(search_text) || '%')
  order by p.full_name
  limit 30
$$;

revoke all on function public.chat_recipient_search(text) from public, anon;
grant execute on function public.chat_recipient_search(text) to authenticated;

-- The meeting participant picker is a normal-workforce selector.  Hosts are
-- intentionally separate, so the existing management-host RPC is untouched.
create or replace function public.meeting_workforce()
returns table(id uuid, full_name text, designation text, department_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.designation, d.name
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where auth.uid() is not null
    and (public.has_permission('meetings.create') or public.has_permission('meetings.manage'))
    and p.is_employee = true
    and p.workforce_visible = true
    and p.role <> 'director'
    and p.status::text in ('active', 'intern', 'probation')
  order by p.full_name
$$;

revoke all on function public.meeting_workforce() from public, anon;
grant execute on function public.meeting_workforce() to authenticated;

notify pgrst, 'reload schema';
