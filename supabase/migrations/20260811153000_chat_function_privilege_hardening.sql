-- Supabase can retain explicit anon/authenticated EXECUTE grants even after
-- revoking the implicit PUBLIC grant. Keep internal security-definer helpers
-- private and expose only the authenticated wrapper used by the Chat UI.

revoke all on function public.ensure_all_employees_chat_member(uuid)
  from public, anon, authenticated;

revoke all on function public.ensure_my_all_employees_chat()
  from public, anon;
grant execute on function public.ensure_my_all_employees_chat()
  to authenticated;

revoke all on function public.sync_all_employees_chat_membership()
  from public, anon, authenticated;
