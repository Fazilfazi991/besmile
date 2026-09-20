-- Lead sources are data-driven; activate the canonical client-requested source
-- without renaming or modifying any historical lead records.
insert into public.crm_lead_sources (name, is_active)
values ('Outdoor Marketing', true)
on conflict (name) do update
set is_active = true;
