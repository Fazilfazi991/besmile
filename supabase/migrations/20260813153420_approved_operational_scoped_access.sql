-- Approved, account-specific operational access. Resolve accounts and permissions
-- by stable email/code instead of generated identifiers so this remains rerunnable.
insert into public.permissions(code, description) values
  ('crm.view_assigned', 'View CRM records assigned to the user or linked to an assigned clinical client'),
  ('tasks.view_self', 'View and update own assigned tasks'),
  ('leave.self', 'Create, view, and cancel own pending leave requests')
on conflict (code) do update set description = excluded.description;

insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, seed.reason
from (values
  ('aishwaryabsmile@gmail.com', 'crm.view_assigned', 'Approved assigned and clinical-client CRM read access'),
  ('internbsmile@gmail.com', 'crm.view_assigned', 'Approved assigned and clinical-client CRM read access'),
  ('internbsmile@gmail.com', 'leave.self', 'Approved employee self-service leave access'),
  ('salesheadbsmile@gmail.com', 'tasks.view_self', 'Approved own and assigned task access')
) seed(email, permission_code, reason)
join public.profiles profile
  on lower(profile.email) = seed.email
 and profile.status = 'active'
 and profile.is_employee is true
join public.permissions permission on permission.code = seed.permission_code
where not exists (
  select 1
  from public.user_permission_grants existing
  where existing.profile_id = profile.id
    and existing.permission_id = permission.id
    and existing.revoked_at is null
    and existing.starts_at <= now()
    and (existing.expires_at is null or existing.expires_at > now())
);

-- A personal CRM scope includes a directly assigned lead and a lead converted to
-- a clinical client the current user can access. Management/team behavior stays
-- unchanged. This function is the RLS source of truth for list and direct-ID reads.
create or replace function public.crm_lead_can_view(target uuid, clinical_client uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('crm.manage_all')
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

drop policy if exists "crm leads scoped read" on public.crm_leads;
create policy "crm leads scoped read"
on public.crm_leads for select to authenticated
using (archived_at is null and public.crm_lead_can_view(assigned_to, converted_patient_id));

-- Follow-up history follows the parent lead's scoped read boundary. Mutation
-- additionally requires lead-edit authority; a read-only scoped grant is not enough.
drop policy if exists "crm followups access" on public.crm_lead_followups;
drop policy if exists "crm followups scoped read" on public.crm_lead_followups;
drop policy if exists "crm followups scoped insert" on public.crm_lead_followups;
drop policy if exists "crm followups scoped update" on public.crm_lead_followups;
drop policy if exists "crm followups scoped delete" on public.crm_lead_followups;
create policy "crm followups scoped read"
on public.crm_lead_followups for select to authenticated
using (
  exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id
      and public.crm_lead_can_view(lead.assigned_to, lead.converted_patient_id)
  )
);
create policy "crm followups scoped insert"
on public.crm_lead_followups for insert to authenticated
with check (
  created_by = auth.uid()
  and public.has_permission('leads.edit')
  and exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id and public.crm_lead_can_edit(lead.assigned_to)
  )
);
create policy "crm followups scoped update"
on public.crm_lead_followups for update to authenticated
using (
  public.has_permission('leads.edit')
  and exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id and public.crm_lead_can_edit(lead.assigned_to)
  )
)
with check (
  public.has_permission('leads.edit')
  and exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id and public.crm_lead_can_edit(lead.assigned_to)
  )
);
create policy "crm followups scoped delete"
on public.crm_lead_followups for delete to authenticated
using (public.has_permission('crm.delete'));

-- A scoped clinical/client CRM grant never implies sales access. Remove the
-- permissive compatibility policy and require an explicit sales permission.
create or replace function public.crm_sale_can_view(sale uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_sales subject_sale
    join public.crm_leads lead on lead.id = subject_sale.lead_id
    where subject_sale.id = sale
      and (
        public.has_permission('crm.manage_all')
        or (public.has_permission('crm.view_team') and public.in_management_tree(lead.assigned_to))
        or (lead.assigned_to = auth.uid() and public.has_permission('sales.view'))
      )
  )
$$;

drop policy if exists "crm sales access" on public.crm_sales;
drop policy if exists "crm sales scoped read" on public.crm_sales;
drop policy if exists "crm sales scoped create" on public.crm_sales;
drop policy if exists "crm sales scoped update" on public.crm_sales;
drop policy if exists "crm sales scoped delete" on public.crm_sales;
create policy "crm sales scoped read"
on public.crm_sales for select to authenticated
using (public.crm_sale_can_view(id));
create policy "crm sales scoped create"
on public.crm_sales for insert to authenticated
with check (
  public.has_permission('sales.edit')
  and exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id and public.crm_lead_can_edit(lead.assigned_to)
  )
);
create policy "crm sales scoped update"
on public.crm_sales for update to authenticated
using (public.crm_sale_can_edit(id) and public.has_permission('sales.edit'))
with check (public.crm_sale_can_edit(id) and public.has_permission('sales.edit'));
create policy "crm sales scoped delete"
on public.crm_sales for delete to authenticated
using (public.has_permission('crm.delete'));

-- Self-service cancellation is limited to the account owner's pending request.
drop policy if exists "leave employee eligible updates" on public.leave_requests;
create policy "leave employee eligible updates"
on public.leave_requests for update to authenticated
using (
  profile_id = (select auth.uid())
  and public.profile_is_employee(profile_id)
  and status = 'pending'
)
with check (
  profile_id = (select auth.uid())
  and status in ('cancelled', 'withdrawn')
  and approver_id is null
);

notify pgrst, 'reload schema';
