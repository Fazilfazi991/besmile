-- Internal employee onboarding uses a temporary password that must be changed
-- before workspace access. The value itself is only ever held by Supabase Auth.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.enforce_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.id = auth.uid() and new.must_change_password is distinct from old.must_change_password then
    raise exception 'First-login password state is server controlled';
  end if;

  if old.id = auth.uid() and not public.is_management() then
    if new.role is distinct from old.role
      or new.department_id is distinct from old.department_id
      or new.designation is distinct from old.designation
      or new.manager_id is distinct from old.manager_id
      or new.employee_code is distinct from old.employee_code
      or new.joining_date is distinct from old.joining_date
      or new.status is distinct from old.status
      or new.email is distinct from old.email then
      raise exception 'Employment fields cannot be changed by employees';
    end if;
  end if;
  return new;
end
$$;

comment on column public.profiles.must_change_password is 'Server-controlled first-login state. It never stores a password.';
