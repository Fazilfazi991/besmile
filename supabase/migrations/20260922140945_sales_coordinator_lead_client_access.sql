-- Give the Operations / Sales Coordinator designation full operational lead
-- coverage without granting CRM administration. Client access is deliberately
-- limited to identity and contact data; clinical workspace policies continue
-- to require a care-scoped permission.
insert into public.permissions(code, description) values
  ('leads.view_all', 'View all active CRM leads without CRM administration'),
  ('patients.view_identity', 'View active client identity and contact information only')
on conflict (code) do update set description = excluded.description;

insert into public.designation_permission_bundles(
  name,
  department_name,
  designation,
  is_active
)
values ('Operations Sales Coordinator', 'Operations', 'Sales Coordinator', true)
on conflict(department_name, designation) do update
set is_active = true,
    updated_at = now();

insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, permission.id
from public.designation_permission_bundles bundle
cross join public.permissions permission
where bundle.department_name = 'Operations'
  and bundle.designation = 'Sales Coordinator'
  and bundle.is_active
  and permission.code = any(array['leads.view_all', 'patients.view_identity'])
on conflict do nothing;

-- The one-argument overload remains the update-policy compatibility helper;
-- the two-argument overload is the current list/detail read source of truth.
create or replace function public.crm_lead_can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('crm.manage_all')
    or public.has_permission('leads.view_all')
    or (public.has_permission('crm.view_team') and public.in_management_tree(target))
    or (
      target = auth.uid()
      and (
        public.has_permission('crm.view_assigned')
        or public.has_permission('leads.view')
      )
    )
$$;

create or replace function public.crm_lead_can_view(target uuid, clinical_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('crm.manage_all')
    or public.has_permission('leads.view_all')
    or (public.has_permission('crm.view_team') and public.in_management_tree(target))
    or (
      public.has_permission('crm.view_assigned')
      and (
        target = auth.uid()
        or (clinical_client is not null and public.patient_access(clinical_client))
      )
    )
    or (target = auth.uid() and public.has_permission('leads.view'))
$$;

create or replace function public.crm_lead_can_edit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('crm.manage_all')
    or (
      public.has_permission('leads.view_all')
      and public.has_permission('leads.edit')
    )
    or (
      public.has_permission('crm.view_team')
      and public.in_management_tree(target)
      and public.has_permission('leads.edit')
    )
    or (target = auth.uid() and public.has_permission('leads.edit'))
$$;

-- Preserve the pre-existing patient scope as the care/clinical boundary.
create or replace function public.patient_care_access(patient uuid)
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

create or replace function public.patient_access(patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.patient_care_access(patient)
    or (
      public.has_permission('patients.view_identity')
      and exists(
        select 1
        from public.patients p
        where p.id = patient
          and p.deleted_at is null
      )
    )
$$;

-- Identity-only access must never become appointment, session, note, document,
-- or activity access, even if another narrow permission is added later.
create or replace function public.appointment_patient_access(action text, target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.appointment_has_permission(action)
    and public.patient_care_access(target_patient)
$$;

create or replace function public.patient_document_access(doc public.patient_documents)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.patient_care_access(doc.patient_id)
    and public.has_permission('patient_documents.view')
    and (
      doc.visibility = 'general_staff'
      or (
        doc.visibility = 'assigned_psychologist'
        and exists(
          select 1 from public.patients p
          where p.id = doc.patient_id
            and p.assigned_psychologist_id = auth.uid()
        )
      )
      or (doc.visibility = 'clinical_team' and public.has_permission('clinical_notes.view'))
      or (doc.visibility = 'management_only' and public.is_management())
    )
$$;

drop policy if exists "patient records edit" on public.patients;
create policy "patient records edit"
on public.patients for update to authenticated
using (public.patient_care_access(id) and public.has_permission('patients.edit'))
with check (public.patient_care_access(id) and public.has_permission('patients.edit'));

drop policy if exists "patient sessions access" on public.patient_sessions;
create policy "patient sessions access"
on public.patient_sessions for select to authenticated
using (deleted_at is null and public.patient_care_access(patient_id));

drop policy if exists "patient sessions create" on public.patient_sessions;
create policy "patient sessions create"
on public.patient_sessions for insert to authenticated
with check (
  public.patient_care_access(patient_id)
  and public.has_permission('patient_sessions.create')
);

drop policy if exists "patient sessions edit" on public.patient_sessions;
create policy "patient sessions edit"
on public.patient_sessions for update to authenticated
using (
  public.patient_care_access(patient_id)
  and (
    public.has_permission('patient_sessions.edit')
    or public.has_permission('patient_sessions.cancel')
  )
)
with check (
  public.patient_care_access(patient_id)
  and (
    public.has_permission('patient_sessions.edit')
    or public.has_permission('patient_sessions.cancel')
  )
);

drop policy if exists "patient documents write" on public.patient_documents;
create policy "patient documents write"
on public.patient_documents for insert to authenticated
with check (
  public.patient_care_access(patient_id)
  and public.has_permission('patient_documents.upload')
);

drop policy if exists "patient documents change" on public.patient_documents;
create policy "patient documents change"
on public.patient_documents for update to authenticated
using (public.patient_document_access(patient_documents))
with check (
  public.patient_care_access(patient_id)
  and (
    public.has_permission('patient_documents.archive')
    or public.has_permission('patient_documents.replace')
    or public.has_permission('patient_documents.delete')
  )
);

drop policy if exists "patient notes access" on public.patient_notes;
create policy "patient notes access"
on public.patient_notes for select to authenticated
using (
  deleted_at is null
  and public.patient_care_access(patient_id)
  and (
    (note_type = 'administrative' and public.has_permission('patient_notes.view'))
    or (note_type = 'clinical' and public.has_permission('clinical_notes.view'))
  )
);

drop policy if exists "patient notes write" on public.patient_notes;
create policy "patient notes write"
on public.patient_notes for all to authenticated
using (
  public.patient_care_access(patient_id)
  and (
    (note_type = 'administrative' and public.has_permission('patient_notes.edit'))
    or (note_type = 'clinical' and public.has_permission('clinical_notes.edit'))
  )
)
with check (
  public.patient_care_access(patient_id)
  and (
    (note_type = 'administrative' and public.has_permission('patient_notes.create'))
    or (note_type = 'clinical' and public.has_permission('clinical_notes.create'))
  )
);

drop policy if exists "patient activity access" on public.patient_activity_logs;
create policy "patient activity access"
on public.patient_activity_logs for select to authenticated
using (
  public.patient_care_access(patient_id)
  and public.has_permission('patient_activity.view')
);

notify pgrst, 'reload schema';
