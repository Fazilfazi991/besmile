-- Correct patient navigation permissions, patient appointment access, and universal Idea Hub access.

insert into public.permissions(code, description) values
  ('patients.view', 'View permitted patient records'),
  ('patients.view_all', 'View all patient summaries when explicitly authorized'),
  ('patients.view_assigned', 'Use the assigned-patient shortcut for explicitly assigned patients'),
  ('patients.edit', 'Edit permitted patient records'),
  ('appointments.view', 'View doctor appointments from patient profiles'),
  ('appointments.create', 'Create doctor appointments from patient profiles'),
  ('appointments.update', 'Edit doctor appointments from patient profiles'),
  ('appointments.reschedule', 'Reschedule doctor appointments from patient profiles'),
  ('appointments.cancel', 'Cancel doctor appointments from patient profiles'),
  ('appointments.update_status', 'Update doctor appointment status from patient profiles'),
  ('appointments.delete', 'Soft delete doctor appointments from patient profiles'),
  ('ideas.view', 'View Idea Hub'),
  ('ideas.create', 'Submit Idea Hub ideas'),
  ('ideas.support', 'Support ideas'),
  ('ideas.comment', 'Comment on ideas')
on conflict(code) do update set description = excluded.description;

do $$
declare
  idea_permissions text[] := array['ideas.view','ideas.create','ideas.support','ideas.comment'];
  appointment_manage text[] := array[
    'doctor_scheduling.view','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status'
  ];
  appointment_full text[] := appointment_manage || array['doctor_scheduling.manage_doctors','appointments.delete'];
  administration_permissions text[] := array['patients.view','patients.view_all','patients.edit','patients.assign','patient_activity.view'] || appointment_full || idea_permissions;
  psychologist_permissions text[] := array['patients.view','patients.view_assigned','patients.edit','patient_activity.view'] || appointment_manage || idea_permissions;
  intern_psychologist_permissions text[] := array['patients.view','patients.view_assigned','patient_activity.view'] || appointment_manage || idea_permissions;
  social_worker_permissions text[] := array['patients.view','patients.edit','patient_activity.view'] || appointment_manage || idea_permissions;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(idea_permissions)
    on conflict do nothing;

    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on (
        (role.code in ('chairman','director','general_manager') and permission.code = any(administration_permissions))
        or (role.code in ('psychologist') and permission.code = any(psychologist_permissions))
        or (role.code in ('social_worker') and permission.code = any(social_worker_permissions))
        or (role.code in ('intern_psychologist') and permission.code = any(intern_psychologist_permissions))
      )
    on conflict do nothing;

    delete from public.role_permissions role_permission
    using public.roles role, public.permissions permission
    where role_permission.role_id = role.id
      and role_permission.permission_id = permission.id
      and permission.code = 'patients.view_assigned'
      and role.code in ('administration','administration_admin','reception','receptionist','social_worker','chairman','director','general_manager');
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select seed.role_name::public.employee_role, permission.id
    from (
      values
        ('Chairman', idea_permissions),
        ('Director', idea_permissions),
        ('General Manager', administration_permissions),
        ('Psychologist', psychologist_permissions),
        ('Intern', idea_permissions),
        ('Guest Sales', idea_permissions)
    ) as seed(role_name, codes)
    join public.permissions permission on permission.code = any(seed.codes)
    on conflict do nothing;

    delete from public.role_permissions role_permission
    using public.permissions permission
    where role_permission.permission_id = permission.id
      and permission.code = 'patients.view_assigned'
      and role_permission.role::text in ('Chairman','Director','General Manager');
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'designation_permission_bundles') then
    insert into public.designation_permission_bundles(name, department_name, designation, is_active)
    values
      ('Psychology Psychologist', 'Psychology', 'Psychologist', true),
      ('Psychology Intern Psychologist', 'Psychology', 'Intern Psychologist', true),
      ('Social Work Social Worker', 'Social Work', 'Social Worker', true)
    on conflict(name) do update
    set department_name = excluded.department_name,
        designation = excluded.designation,
        is_active = true,
        updated_at = now();

    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission on permission.code = any(idea_permissions)
    where bundle.is_active
    on conflict do nothing;

    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission
      on (
        (lower(bundle.department_name) = 'administration' and permission.code = any(administration_permissions))
        or (lower(bundle.designation) = 'psychologist' and permission.code = any(psychologist_permissions))
        or (lower(bundle.designation) = 'intern psychologist' and permission.code = any(intern_psychologist_permissions))
        or (lower(bundle.designation) = 'social worker' and permission.code = any(social_worker_permissions))
      )
    where bundle.is_active
    on conflict do nothing;

    delete from public.designation_permission_bundle_permissions bundle_permission
    using public.designation_permission_bundles bundle, public.permissions permission
    where bundle_permission.bundle_id = bundle.id
      and bundle_permission.permission_id = permission.id
      and permission.code = 'patients.view_assigned'
      and (
        lower(bundle.department_name) = 'administration'
        or lower(bundle.designation) = 'social worker'
        or lower(bundle.designation) in ('admin','receptionist','reception')
      );

    delete from public.designation_permission_bundle_permissions bundle_permission
    using public.designation_permission_bundles bundle, public.permissions permission
    where bundle_permission.bundle_id = bundle.id
      and bundle_permission.permission_id = permission.id
      and permission.code = 'appointments.delete'
      and lower(bundle.designation) in ('psychologist','intern psychologist','social worker','intern');
  end if;
end $$;

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

create or replace function public.appointment_patient_access(action text, target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.appointment_has_permission(action)
    and public.patient_access(target_patient)
$$;

drop policy if exists "doctor scheduling appointments view" on public.doctor_appointments;
create policy "doctor scheduling appointments view" on public.doctor_appointments for select to authenticated using (
  deleted_at is null
  and public.appointment_patient_access('view', patient_id)
);

drop policy if exists "doctor scheduling appointments create" on public.doctor_appointments;
create policy "doctor scheduling appointments create" on public.doctor_appointments for insert to authenticated with check (
  public.appointment_patient_access('create', patient_id)
  and created_by = auth.uid()
);

drop policy if exists "doctor scheduling appointments update" on public.doctor_appointments;
create policy "doctor scheduling appointments update" on public.doctor_appointments for update to authenticated using (
  public.appointment_patient_access('update', patient_id)
  or public.appointment_patient_access('reschedule', patient_id)
  or public.appointment_patient_access('cancel', patient_id)
  or public.appointment_patient_access('delete', patient_id)
  or public.appointment_patient_access('update_status', patient_id)
) with check (
  public.appointment_patient_access('update', patient_id)
  or public.appointment_patient_access('reschedule', patient_id)
  or public.appointment_patient_access('cancel', patient_id)
  or public.appointment_patient_access('delete', patient_id)
  or public.appointment_patient_access('update_status', patient_id)
);

drop policy if exists "ideas readable" on public.ideas;
create policy "ideas readable" on public.ideas for select to authenticated using (
  public.has_permission('ideas.view')
  and (archived_at is null or public.has_permission('ideas.archive'))
);

drop policy if exists "ideas creatable" on public.ideas;
create policy "ideas creatable" on public.ideas for insert to authenticated with check (
  public.has_permission('ideas.create')
  and submitted_by = auth.uid()
  and status = 'Submitted'
  and archived_at is null
  and exists(select 1 from public.idea_categories c where c.id = category_id and c.is_active and c.deleted_at is null)
);

drop policy if exists "idea supports readable" on public.idea_supports;
create policy "idea supports readable" on public.idea_supports for select to authenticated using(public.idea_is_visible(idea_id));

drop policy if exists "idea supports own create" on public.idea_supports;
create policy "idea supports own create" on public.idea_supports for insert to authenticated with check (
  public.has_permission('ideas.support')
  and employee_id = auth.uid()
  and public.idea_is_visible(idea_id)
);

drop policy if exists "idea supports own delete" on public.idea_supports;
create policy "idea supports own delete" on public.idea_supports for delete to authenticated using (
  public.has_permission('ideas.support')
  and employee_id = auth.uid()
);

drop policy if exists "idea comments readable" on public.idea_comments;
create policy "idea comments readable" on public.idea_comments for select to authenticated using(public.idea_is_visible(idea_id));

drop policy if exists "idea comments create" on public.idea_comments;
create policy "idea comments create" on public.idea_comments for insert to authenticated with check (
  public.has_permission('ideas.comment')
  and author_employee_id = auth.uid()
  and public.idea_is_visible(idea_id)
  and (not is_official_response or public.has_permission('ideas.manage_status'))
);

drop policy if exists "idea comments update" on public.idea_comments;
create policy "idea comments update" on public.idea_comments for update to authenticated using (
  (author_employee_id = auth.uid() and public.has_permission('ideas.comment'))
  or public.has_permission('ideas.moderate_comments')
) with check (
  (author_employee_id = auth.uid() and public.has_permission('ideas.comment'))
  or public.has_permission('ideas.moderate_comments')
);

notify pgrst, 'reload schema';
