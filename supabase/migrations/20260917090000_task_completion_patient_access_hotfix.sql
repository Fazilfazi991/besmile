-- Additive hotfix: keep the parent task aggregate in sync with employee
-- completion, and complete the canonical Psychologist patient workspace.

create or replace function public.complete_task_assignment(target_assignment uuid, completion_update text)
returns public.task_assignments
language plpgsql
security definer
set search_path = public
as $fn$
declare
  assignment public.task_assignments;
  message text := trim(coalesce(completion_update, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(message) < 1 or char_length(message) > 2000 then
    raise exception 'Completion update must be between 1 and 2,000 characters' using errcode = '22023';
  end if;

  select * into assignment from public.task_assignments where id = target_assignment for update;
  if assignment.id is null or assignment.profile_id <> auth.uid() then
    raise exception 'Task assignment is unavailable' using errcode = '42501';
  end if;
  if assignment.status <> 'in_progress' then
    raise exception 'Only an in-progress task can be completed' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'Only active employees can complete tasks' using errcode = '42501';
  end if;

  insert into public.task_comments(task_id, author_id, body)
  values (assignment.task_id, auth.uid(), message);
  update public.task_assignments
  set status = 'completed', updated_at = now()
  where id = assignment.id
  returning * into assignment;

  -- Management dashboards read tasks.status. Mark the parent complete only
  -- when every assignment is complete, preserving multi-assignee semantics.
  if not exists (
    select 1 from public.task_assignments
    where task_id = assignment.task_id and status <> 'completed'
  ) then
    update public.tasks
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        completed_by = auth.uid()
    where id = assignment.task_id;
  end if;
  return assignment;
end;
$fn$;

revoke all on function public.complete_task_assignment(uuid, text) from public, anon;
grant execute on function public.complete_task_assignment(uuid, text) to authenticated;

insert into public.permissions(code, description) values
  ('patient_documents.view', 'View permitted patient documents'),
  ('patient_documents.upload', 'Upload documents to permitted patient records'),
  ('patient_documents.download', 'Download documents from permitted patient records'),
  ('patient_notes.view', 'View permitted patient notes'),
  ('patient_notes.create', 'Add notes to permitted patient records'),
  ('patient_notes.edit', 'Edit authorized patient notes'),
  ('clinical_notes.view', 'View permitted clinical notes'),
  ('clinical_notes.create', 'Add clinical notes to permitted patient records'),
  ('clinical_notes.edit', 'Edit authorized clinical notes')
on conflict(code) do update set description = excluded.description;

-- Add missing capabilities to the existing Psychologist role; never replace
-- or delete the role's earlier permissions.
-- Production still has the supported legacy role_permissions(role, permission_id)
-- shape, while QA uses role_permissions(role_id, permission_id). Seed the same
-- additive capability set through whichever shape the target exposes.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'Psychologist'::public.employee_role, p.id
    from public.permissions p
    where p.code = any(array[
      'patient_documents.view','patient_documents.upload','patient_documents.download',
      'patient_notes.view','patient_notes.create','patient_notes.edit',
      'clinical_notes.view','clinical_notes.create','clinical_notes.edit'
    ])
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select r.id, p.id from public.roles r cross join public.permissions p
    where r.code = 'psychologist'
      and p.code = any(array[
        'patient_documents.view','patient_documents.upload','patient_documents.download',
        'patient_notes.view','patient_notes.create','patient_notes.edit',
        'clinical_notes.view','clinical_notes.create','clinical_notes.edit'
      ])
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema for patient workspace permission seeding';
  end if;
end $$;

insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, permission.id
from public.designation_permission_bundles bundle
cross join public.permissions permission
where lower(bundle.designation) = 'psychologist'
  and bundle.is_active
  and permission.code = any(array[
    'patient_documents.view','patient_documents.upload','patient_documents.download',
    'patient_notes.view','patient_notes.create','patient_notes.edit',
    'clinical_notes.view','clinical_notes.create','clinical_notes.edit'
  ])
on conflict do nothing;

grant select, insert, update on table public.patient_documents to authenticated;
grant select, insert, update on table public.patient_notes, public.patient_sessions to authenticated;
revoke all on table public.patient_documents, public.patient_notes, public.patient_sessions from anon;

notify pgrst, 'reload schema';
