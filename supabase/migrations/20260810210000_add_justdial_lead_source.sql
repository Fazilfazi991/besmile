-- Lead sources are data-driven; add the client-requested source without changing existing records.
insert into public.crm_lead_sources (name)
values ('Justdial')
on conflict (name) do nothing;
