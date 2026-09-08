-- The chat INSERT policy invokes this helper for every message, including those
-- without a reply target. Its defining migration revoked PUBLIC/anon execution
-- but omitted the authenticated grant, causing all legitimate sends to fail.
-- The helper remains SECURITY DEFINER and performs its own membership check.

revoke all on function public.chat_reply_target_is_valid(uuid, uuid) from public, anon;
grant execute on function public.chat_reply_target_is_valid(uuid, uuid) to authenticated;
