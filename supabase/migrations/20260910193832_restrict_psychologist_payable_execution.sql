-- Repair environments that already applied the original D1 migration.
-- This internal SECURITY DEFINER helper is invoked by privileged lifecycle triggers,
-- never directly by application users. Preserve the canonical service-role boundary.
revoke all on function public.create_psychologist_session_payable(uuid) from public, anon, authenticated;
grant execute on function public.create_psychologist_session_payable(uuid) to service_role;
notify pgrst, 'reload schema';
