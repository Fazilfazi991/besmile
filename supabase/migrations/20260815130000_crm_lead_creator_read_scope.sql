-- An employee with leads.create may create a self-assigned lead. PostgREST
-- evaluates SELECT RLS for INSERT ... RETURNING, so the creator must also be
-- able to read exactly that newly-created, self-assigned record. Do not extend
-- the broader CRM read scope: cross-assigned/team leads still require their
-- existing explicit visibility permissions.
drop policy if exists "crm leads scoped read" on public.crm_leads;

create policy "crm leads scoped read"
on public.crm_leads
for select
to authenticated
using (
  archived_at is null
  and (
    public.crm_lead_can_view(assigned_to, converted_patient_id)
    or (
      created_by = auth.uid()
      and assigned_to = auth.uid()
      and public.has_permission('leads.create')
    )
  )
);
