-- RLS policies for this table already restrict authenticated reads and
-- management writes. Explicit grants expose those policy-controlled operations
-- through Supabase's Data API without granting anonymous access.
revoke all on table public.awareness_events from anon;
grant select, insert, update, delete on table public.awareness_events to authenticated;
grant select, insert, update, delete on table public.awareness_events to service_role;
