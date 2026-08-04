-- BSmile role, gender, and patient URL corrections.
-- Forward-only: preserves profile IDs, auth accounts, patient UUID primary keys,
-- and all patient-related foreign-key data.

create or replace function public.patient_slug_base(input text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(regexp_replace(lower(trim(coalesce(input, 'patient'))), '[^a-z0-9\s-]', '', 'g'), '\s+', '-', 'g'), ''), 'patient')
$$;

create or replace function public.patient_unique_slug(input_name text, exclude_patient_id uuid default null)
returns text
language plpgsql
stable
set search_path=public
as $$
declare
  base text := public.patient_slug_base(input_name);
  candidate text := base;
  suffix integer := 2;
begin
  while exists (
    select 1 from public.patients
    where slug = candidate and (exclude_patient_id is null or id <> exclude_patient_id)
  ) loop
    candidate := base || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;
  return candidate;
end $$;

alter table public.patients add column if not exists slug text;

do $$
declare
  row record;
begin
  for row in select id, full_name from public.patients where slug is null or btrim(slug) = '' order by created_at, id loop
    update public.patients
    set slug = public.patient_unique_slug(row.full_name, row.id)
    where id = row.id;
  end loop;
end $$;

alter table public.patients alter column slug set not null;
create unique index if not exists patients_slug_unique_idx on public.patients(slug);

create or replace function public.ensure_patient_slug()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.patient_unique_slug(new.full_name, new.id);
  else
    new.slug := public.patient_slug_base(new.slug);
  end if;
  return new;
end $$;

drop trigger if exists patients_ensure_slug on public.patients;
create trigger patients_ensure_slug
before insert or update of slug on public.patients
for each row execute function public.ensure_patient_slug();

update public.patients
set gender = case
  when lower(btrim(coalesce(gender, ''))) = 'male' then 'male'
  when lower(btrim(coalesce(gender, ''))) = 'female' then 'female'
  else null
end;

do $$
begin
  alter table public.patients drop constraint if exists patients_gender_check;
  alter table public.patients add constraint patients_gender_check check (gender is null or gender in ('male','female'));
end $$;

update public.profiles
set gender = case
  when lower(btrim(coalesce(gender, ''))) = 'male' then 'male'
  when lower(btrim(coalesce(gender, ''))) = 'female' then 'female'
  else null
end;

do $$
begin
  alter table public.profiles drop constraint if exists profiles_gender_check;
  alter table public.profiles add constraint profiles_gender_check check (gender is null or gender in ('male','female'));
end $$;

-- Diya remains the same auth user and profile row; only role/designation change.
update public.profiles
set role = 'staff'::public.app_role,
    designation = 'Admin',
    updated_at = now()
where lower(email) = 'diyaadminbsmile@gmail.com';

-- Remove obsolete Social Worker access configuration without touching activity,
-- patient, document, note, session, or auth records.
delete from public.user_permission_grants permission_grant
using public.profiles profile
where permission_grant.profile_id = profile.id
  and profile.role::text = 'social_worker';

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    delete from public.role_permissions rp
    using public.roles r
    where rp.role_id = r.id and r.code::text = 'social_worker';
  end if;

  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    delete from public.role_permissions where role::text = 'Social Worker';
  end if;
end $$;

delete from public.roles where code::text = 'social_worker' or name = 'Social Worker';
delete from public.designations where name = 'Social Worker';

update public.profiles
set role = 'staff'::public.app_role,
    designation = nullif(regexp_replace(coalesce(designation, ''), '(?i)\bsocial\s+worker\b', 'Staff', 'g'), ''),
    updated_at = now()
where role::text = 'social_worker';
