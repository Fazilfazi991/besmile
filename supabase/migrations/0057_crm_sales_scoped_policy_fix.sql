-- Keep CRM sale access aligned with lead assignment scope.
create or replace function public.crm_sale_access(subject_lead uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.crm_leads lead
    where lead.id = subject_lead
      and lead.archived_at is null
      and (
        lead.assigned_to = auth.uid()
        or public.crm_can_manage(lead.assigned_to)
      )
  )
$$;

drop policy if exists "crm sales access" on public.crm_sales;
create policy "crm sales access" on public.crm_sales
for all to authenticated
using (public.crm_sale_access(lead_id))
with check (public.crm_sale_access(lead_id));
