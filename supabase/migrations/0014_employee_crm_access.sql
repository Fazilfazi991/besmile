-- Allow an employee to read and update sales that belong to a lead assigned to them.
-- Management access remains governed by crm_can_manage().
drop policy if exists "crm sales access" on public.crm_sales;
create policy "crm sales access" on public.crm_sales
for all to authenticated
using (
  exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id
      and (lead.assigned_to = auth.uid() or public.crm_can_manage(lead.assigned_to))
  )
)
with check (
  exists (
    select 1 from public.crm_leads lead
    where lead.id = lead_id
      and (lead.assigned_to = auth.uid() or public.crm_can_manage(lead.assigned_to))
  )
);
