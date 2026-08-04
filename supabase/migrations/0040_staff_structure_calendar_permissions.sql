-- Staff structure, calendar data, and granular access extensions.
-- Forward-only migration. Rollback: deactivate seeded records and revoke role grants;
-- do not delete profiles, audit rows, or existing permission assignments.

alter table public.departments add column if not exists is_active boolean not null default true;
alter table public.departments add column if not exists updated_at timestamptz not null default now();
alter table public.designations add column if not exists is_active boolean not null default true;
alter table public.designations add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists employee_code text;
alter table public.profiles add column if not exists employment_type text;
alter table public.profiles add column if not exists branch_id uuid;
create unique index if not exists profiles_employee_code_unique_idx on public.profiles(employee_code) where employee_code is not null;
create index if not exists profiles_manager_active_idx on public.profiles(manager_id,status);

create table if not exists public.profile_secondary_supervisors (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(profile_id, supervisor_id),
  check(profile_id <> supervisor_id)
);
create index if not exists profile_secondary_supervisors_supervisor_idx on public.profile_secondary_supervisors(supervisor_id);

create or replace function public.prevent_reporting_cycle() returns trigger language plpgsql as $$
begin
  if new.manager_id is null then return new; end if;
  if new.manager_id = new.id then raise exception 'An employee cannot report to themselves'; end if;
  if exists (
    with recursive ancestors as (
      select id, manager_id from public.profiles where id = new.manager_id
      union all
      select p.id, p.manager_id from public.profiles p join ancestors a on p.id = a.manager_id
    ) select 1 from ancestors where id = new.id
  ) then raise exception 'Reporting relationship would create a circular hierarchy'; end if;
  return new;
end $$;
drop trigger if exists profiles_prevent_reporting_cycle on public.profiles;
create trigger profiles_prevent_reporting_cycle before insert or update of manager_id on public.profiles for each row execute function public.prevent_reporting_cycle();

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_branch_id_fkey') then
    alter table public.profiles add constraint profiles_branch_id_fkey foreign key(branch_id) references public.branches(id) on delete set null;
  end if;
end $$;

create table if not exists public.awareness_events (
  id uuid primary key default gen_random_uuid(), name text not null, event_type text not null default 'awareness_day' check(event_type='awareness_day'),
  recurrence_rule text not null, event_date date, starts_on date, ends_on date, is_active boolean not null default true,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(name, recurrence_rule)
);
create index if not exists awareness_events_active_idx on public.awareness_events(is_active,event_date);

alter table public.holidays add column if not exists is_active boolean not null default true;
alter table public.holidays add column if not exists updated_at timestamptz not null default now();
create index if not exists holidays_active_date_idx on public.holidays(holiday_date) where is_active;

-- The application currently has one organization. Holidays remain unique by date
-- until an organization table is introduced; this preserves existing data safely.
update public.company_attendance_settings set work_end='17:00', working_days=array[1,2,3,4,5,6]
where id=true and working_days=array[1,2,3,4,5];

insert into public.departments(name,is_active) values ('Management',true),('Administration',true),('Psychology',true)
on conflict(name) do update set is_active=true;
insert into public.designations(name,is_active)
select seed.name, true
from (values
 ('General Manager'),('Psychologist'),('Director'),('Chairman'),
 ('Psychology Intern'),('Social Work Intern'),('Administration Intern'),('Online Psychologist'),('Guest Sales')
) as seed(name)
where not exists (select 1 from public.designations existing where existing.name=seed.name and existing.department_id is null);

insert into public.roles(code,name) values
 ('psychologist','Psychologist'),('intern','Intern'),('guest_sales','Guest – Sales')
on conflict(code) do update set name=excluded.name;

insert into public.permissions(code,description) values
 ('dashboard.view','View dashboard'),
 ('leads.view','View leads'),('leads.create','Create leads'),('leads.edit','Edit leads'),('leads.assign','Assign leads'),('leads.manage_status','Manage lead status'),('leads.documents.view','View lead documents'),('leads.documents.manage','Manage lead documents'),
 ('clients.view','View clients'),('clients.create','Create clients'),('clients.edit','Edit clients'),('clients.assign','Assign clients'),('clients.documents.view','View client documents'),('clients.documents.manage','Manage client documents'),('clients.identity.view','View client identity documents'),('clients.identity.manage','Manage client identity documents'),
 ('appointments.view','View appointments'),('appointments.create','Create appointments'),('appointments.edit','Edit appointments'),('appointments.documents.view','View appointment documents'),('appointments.documents.manage','Manage appointment documents'),
 ('sessions.view','View sessions'),('sessions.create','Create sessions'),('sessions.edit','Edit sessions'),('sessions.notes.view','View session notes'),('sessions.notes.manage','Manage session notes'),
 ('employees.create','Create employees'),('employees.edit','Edit employees'),('employees.documents.view','View employee documents'),('employees.documents.manage','Manage employee documents'),
 ('attendance.self','View own attendance'),('attendance.view','View attendance'),('leave.self','Manage own leave'),('leave.view','View leave'),('leave.manage','Manage leave'),('leave.approve','Approve leave'),
 ('innovation.view','View innovation hub'),('innovation.create','Create innovation items'),('innovation.comment','Comment on innovation items'),('innovation.manage','Manage innovation hub'),
 ('calendar.view','View calendar'),('calendar.create','Create calendar entries'),('calendar.edit','Edit calendar entries'),('calendar.manage','Manage calendar'),
 ('feedback.view','View feedback'),('feedback.manage','Manage feedback'),('members.view','View members'),('members.manage','Manage members'),
 ('documents.employee.view','View employee documents'),('documents.employee.manage','Manage employee documents'),('documents.psychologist.view','View psychologist documents'),('documents.psychologist.manage','Manage psychologist documents'),('documents.intern.view','View intern documents'),('documents.intern.manage','Manage intern documents'),('documents.administration.view','View administration documents'),('documents.administration.manage','Manage administration documents'),('documents.agreements.view','View agreements'),('documents.agreements.manage','Manage agreements'),('documents.certifications.view','View certifications'),('documents.certifications.manage','Manage certifications'),('documents.client.view','View client records'),('documents.client.manage','Manage client records'),('documents.appointment.view','View appointment documents'),('documents.appointment.manage','Manage appointment documents'),('documents.identity.view','View identity documents'),('documents.identity.manage','Manage identity documents'),
 ('finance.dashboard.view','View finance dashboard'),('income.view','View income'),('income.manage','Manage income'),('expenses.view','View expenses'),('expenses.manage','Manage expenses'),('payroll.view','View payroll'),('payroll.manage','Manage payroll'),('invoices.view','View invoices'),('invoices.manage','Manage invoices'),('reports.finance.view','View finance reports'),
 ('roles.view','View roles'),('permissions.view','View permissions'),('departments.manage','Manage departments'),('designations.manage','Manage designations'),('company_settings.manage','Manage company settings')
on conflict(code) do nothing;

-- Assign only non-sensitive operational defaults. Separate clinical, identity,
-- appointment, session and employee-record permissions intentionally remain
-- unassigned until the client resolves the conflicting management requirement.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id from public.roles r join public.permissions p on
      (r.code in ('chairman','director','general_manager') and p.code in ('admin.access','dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.manage_status','employees.view','employees.create','employees.edit','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','innovation.view','innovation.create','innovation.comment','innovation.manage','calendar.view','calendar.create','calendar.edit','calendar.manage','feedback.view','feedback.manage','members.view','members.manage','finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage','payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view','roles.view','roles.manage','permissions.view','permissions.manage','departments.manage','designations.manage','company_settings.manage'))
      or (r.code='psychologist' and p.code in ('innovation.view','innovation.create','innovation.comment','calendar.view','calendar.create','calendar.edit','feedback.view','patients.view','patients.create','patients.edit','patient_documents.view','patient_documents.upload','patient_documents.download','patient_notes.view','patient_notes.create','patient_notes.edit','clinical_notes.view','clinical_notes.create','clinical_notes.edit'))
      or (r.code='intern' and p.code in ('patient_documents.view','patient_documents.download'))
      or (r.code='guest_sales' and p.code in ('leads.view','leads.edit','leads.manage_status','leads.documents.view','leads.documents.manage'))
    on conflict do nothing;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role,permission_id)
    select (case r.code when 'psychologist' then 'Psychologist' when 'intern' then 'Intern' when 'guest_sales' then 'Guest – Sales' end)::public.employee_role,p.id
    from public.roles r join public.permissions p on
      (r.code='psychologist' and p.code in ('innovation.view','innovation.create','innovation.comment','calendar.view','calendar.create','calendar.edit','feedback.view','patients.view','patients.create','patients.edit','patient_documents.view','patient_documents.upload','patient_documents.download','patient_notes.view','patient_notes.create','patient_notes.edit','clinical_notes.view','clinical_notes.create','clinical_notes.edit'))
      or (r.code='intern' and p.code in ('patient_documents.view','patient_documents.download'))
      or (r.code='guest_sales' and p.code in ('leads.view','leads.edit','leads.manage_status','leads.documents.view','leads.documents.manage'))
    where r.code in ('psychologist','intern','guest_sales')
    on conflict do nothing;
  end if;
end $$;

-- Update profiles only when an authenticated account already exists. No auth
-- account is created and existing account connections are preserved.
with staff(employee_code,full_name,email,phone,department_name,designation,joining_date,role_code) as (
 values
 ('A001','Muhammad Faiz AU','bsmile.gm@gmail.com','9207626952','Management','General Manager',null::date,'general_manager'::public.app_role),
 ('A002','Diya Anthikat','diyaadminbsmile@gmail.com','8779665569','Administration','Admin','2026-01-26'::date,'staff'::public.app_role),
 ('A004','Aiswarya P','aiswaryabsmile@gmail.com','8606774707','Psychology','Psychologist','2026-02-15'::date,'psychologist'::public.app_role)
)
insert into public.profiles(id,employee_code,full_name,email,phone,department_id,designation,joining_date,role,status,manager_id)
select u.id,s.employee_code,s.full_name,s.email,s.phone,d.id,s.designation,s.joining_date,s.role_code,'active',
 case when s.employee_code='A001' then (select p.id from public.profiles p where p.role='director' and p.status='active' order by p.created_at limit 1)
      else (select p.id from public.profiles p where p.employee_code='A001' or lower(p.email)='bsmile.gm@gmail.com' limit 1) end
from staff s join auth.users u on lower(u.email)=lower(s.email) join public.departments d on d.name=s.department_name
on conflict(email) do update set employee_code=excluded.employee_code,full_name=excluded.full_name,phone=excluded.phone,department_id=excluded.department_id,designation=excluded.designation,joining_date=excluded.joining_date,role=excluded.role,status='active',manager_id=coalesce(excluded.manager_id,public.profiles.manager_id),updated_at=now();

insert into public.holidays(holiday_date,name,is_active) values
 ('2026-08-15','Independence Day',true),('2026-08-25','Milad un-Nabi',true),('2026-08-26','Onam',true),('2026-08-27','Onam',true),('2026-09-04','Sri Krishna Jayanthi',true),('2026-10-02','Mahatma Gandhi Jayanthi',true),('2026-10-20','Dussehra',true),('2026-11-08','Deepavali',true),('2026-12-25','Christmas',true),
 ('2027-01-26','Republic Day',true),('2027-03-06','Shivarathri',true),('2027-03-10','Ramazan Eid',true),('2027-03-26','Good Friday',true),('2027-03-28','Easter',true),('2027-04-14','Ambedkar Jayanthi',true),('2027-04-15','Vishu',true),('2027-05-17','Bakrid',true),('2027-06-16','Muharram',true)
on conflict(holiday_date) do update set name=excluded.name,is_active=excluded.is_active,updated_at=now();

insert into public.awareness_events(name,recurrence_rule,event_date,starts_on,ends_on,notes) values
 ('World Braille Day','annual_date:01-04',null,null,null,null),('National Girl Child Day (India)','annual_date:01-24',null,null,null,null),('World Cancer Day','annual_date:02-04',null,null,null,null),('World Day of Social Justice','annual_date:02-20',null,null,null,null),('International Women''s Day','annual_date:03-08',null,null,null,null),('International Day of Happiness','annual_date:03-20',null,null,null,null),('World Autism Awareness Day','annual_date:04-02',null,null,null,null),('World Health Day','annual_date:04-07',null,null,null,null),('World Earth Day','annual_date:04-22',null,null,null,null),('Mother''s Day','second_sunday:05',null,null,null,null),('International Day of Families','annual_date:05-15',null,null,null,null),('World No Tobacco Day','annual_date:05-31',null,null,null,null),('World Environment Day','annual_date:06-05',null,null,null,null),('World Day Against Child Labour','annual_date:06-12',null,null,null,null),('World Elder Abuse Awareness Day','annual_date:06-15',null,null,null,null),('Father''s Day','third_sunday:06',null,null,null,null),('International Day of Yoga','annual_date:06-21',null,null,null,null),('World Music Day','annual_date:06-21',null,null,null,null),('International Day Against Drug Abuse and Illicit Trafficking','annual_date:06-26',null,null,null,null),('National Doctor''s Day (India)','annual_date:07-01',null,null,null,null),('Cheer Up the Lonely Day','annual_date:07-11',null,null,null,null),('World Brain Day','annual_date:07-22',null,null,null,null),('International Self-Care Day','annual_date:07-24',null,null,null,null),('National Schizophrenia Awareness Day (India)','annual_date:07-25',null,null,null,null),('Friendship Day','first_sunday:08',null,null,null,null),('International Youth Day','annual_date:08-12',null,null,null,null),('National Counseling Psychology Day','annual_date:08-17',null,null,null,null),('National Grief Awareness Day','annual_date:08-30',null,null,null,null),('International Overdose Awareness Day','annual_date:08-31',null,null,null,null),('World Suicide Prevention Day','annual_date:09-10',null,null,null,null),('World Alzheimer''s Day','annual_date:09-21',null,null,null,null),('ADHD Awareness Month','annual_month:10',null,null,null,'Month-long recurring awareness event.'),('International Day of Non-Violence','annual_date:10-02',null,null,null,null),('World Mental Health Day','annual_date:10-10',null,null,null,null),('OCD Awareness Week','configurable_period:10',null,null,null,'Exact mid-October dates require client confirmation.'),('International Stress Awareness Day','first_wednesday:11',null,null,null,null),('World Kindness Day','annual_date:11-13',null,null,null,null),('Children''s Day (India)','annual_date:11-14',null,null,null,null),('International Men''s Day','annual_date:11-19',null,null,null,null),('International Day for the Elimination of Violence Against Women','annual_date:11-25',null,null,null,null),('International Day of Persons with Disabilities','annual_date:12-03',null,null,null,null),('Human Rights Day','annual_date:12-10',null,null,null,null)
on conflict(name,recurrence_rule) do nothing;

alter table public.profile_secondary_supervisors enable row level security;
alter table public.awareness_events enable row level security;
alter table public.branches enable row level security;
drop policy if exists "secondary supervisors readable" on public.profile_secondary_supervisors;
create policy "secondary supervisors readable" on public.profile_secondary_supervisors for select to authenticated using(profile_id=auth.uid() or public.has_permission('employees.view'));
drop policy if exists "secondary supervisors managed" on public.profile_secondary_supervisors;
create policy "secondary supervisors managed" on public.profile_secondary_supervisors for all to authenticated using(public.has_permission('employees.edit')) with check(public.has_permission('employees.edit'));
drop policy if exists "awareness events readable" on public.awareness_events;
create policy "awareness events readable" on public.awareness_events for select to authenticated using(true);
drop policy if exists "awareness events managed" on public.awareness_events;
create policy "awareness events managed" on public.awareness_events for all to authenticated using(public.has_permission('calendar.manage')) with check(public.has_permission('calendar.manage'));
drop policy if exists "branches readable" on public.branches;
create policy "branches readable" on public.branches for select to authenticated using(true);
drop policy if exists "branches managed" on public.branches;
create policy "branches managed" on public.branches for all to authenticated using(public.has_permission('company_settings.manage')) with check(public.has_permission('company_settings.manage'));
