-- Restore Batch 2 patient workspace permissions without granting management
-- unrestricted clinical-note access. Patient row visibility stays scoped by
-- assigned clinician, explicit care-team assignment, management tree, or an
-- explicit view-all grant.
insert into public.permissions(code, description) values
  ('patients.view_assigned', 'View only patients explicitly assigned to the user'),
  ('patients.view_all', 'View all patient summaries when explicitly authorized'),
  ('patient_sessions.create', 'Create patient sessions'),
  ('patient_sessions.edit', 'Edit patient sessions'),
  ('patient_sessions.cancel', 'Cancel or reschedule patient sessions')
on conflict(code) do update set description = excluded.description;

create or replace function public.patient_access(patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.patients p
    where p.id = patient
      and p.deleted_at is null
      and (
        public.has_permission('patients.view_all')
        or (
          public.has_permission('patients.view')
          and (
            p.assigned_psychologist_id = auth.uid()
            or p.created_by = auth.uid()
            or public.patient_is_assigned(p.id)
            or (
              replace(lower(public.current_role()::text), ' ', '_') = 'general_manager'
              and (
                p.assigned_psychologist_id is null
                or public.in_management_tree(p.assigned_psychologist_id)
              )
            )
          )
        )
        or (
          public.has_permission('patients.view_assigned')
          and public.patient_is_assigned(p.id)
        )
      )
  )
$$;

drop policy if exists "patient records create" on public.patients;
create policy "patient records create"
on public.patients
for insert
to authenticated
with check (
  public.has_permission('patients.create')
  and created_by = auth.uid()
);

drop policy if exists "patient documents upload finalize" on public.patient_documents;
create policy "patient documents upload finalize"
on public.patient_documents
for update
to authenticated
using (
  public.patient_access(patient_id)
  and public.has_permission('patient_documents.upload')
  and uploaded_by = auth.uid()
  and storage_key like 'pending-%'
)
with check (
  public.patient_access(patient_id)
  and public.has_permission('patient_documents.upload')
  and uploaded_by = auth.uid()
);

do $$
declare
  gm_permissions text[] := array[
    'patients.view','patients.create','patients.edit',
    'patient_documents.view','patient_documents.upload','patient_documents.download','patient_documents.archive',
    'patient_notes.view','patient_notes.create',
    'patient_activity.view',
    'patient_sessions.create','patient_sessions.edit','patient_sessions.cancel'
  ];
  care_team_permissions text[] := array[
    'patients.view','patients.create','patients.edit',
    'patient_documents.view','patient_documents.upload','patient_documents.download',
    'patient_notes.view','patient_notes.create',
    'patient_activity.view',
    'patient_sessions.create','patient_sessions.edit','patient_sessions.cancel'
  ];
  psychologist_extra text[] := array[
    'clinical_notes.view','clinical_notes.create','clinical_notes.edit'
  ];
  intern_permissions text[] := array[
    'patients.view_assigned',
    'patient_documents.view','patient_documents.download',
    'notifications.view'
  ];
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = any(gm_permissions)
    on conflict do nothing;

    insert into public.role_permissions(role, permission_id)
    select seed.role_name::public.employee_role, permission.id
    from (
      values
        ('Psychologist', care_team_permissions || psychologist_extra),
        ('Intern', intern_permissions)
    ) as seed(role_name, codes)
    join public.permissions permission on permission.code = any(seed.codes)
    on conflict do nothing;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on (
        (role.code = 'general_manager' and permission.code = any(gm_permissions))
        or (role.code = 'psychologist' and permission.code = any(care_team_permissions || psychologist_extra))
        or (role.code = 'intern' and permission.code = any(intern_permissions))
      )
    on conflict do nothing;
  end if;
end $$;
