begin;

create table if not exists public.employee_status_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_status public.record_status not null,
  next_status public.record_status not null,
  reason text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists employee_status_history_profile_created_at_idx
  on public.employee_status_history(profile_id, created_at desc);

alter table public.employee_status_history enable row level security;

drop policy if exists "employee status history readable by employee managers"
  on public.employee_status_history;

create policy "employee status history readable by employee managers"
  on public.employee_status_history for select to authenticated
  using (
    public.has_permission('employees.manage')
    or (
      public.has_permission('employees.view')
      and exists (
        select 1
        from public.profiles target_profile
        where target_profile.id = profile_id
          and not public.profile_role_is_protected(target_profile.role::text)
      )
    )
  );

grant select on table public.employee_status_history to authenticated;

notify pgrst, 'reload schema';

commit;
