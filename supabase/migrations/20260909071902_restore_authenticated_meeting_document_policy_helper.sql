-- A permissive documents INSERT policy for meeting minutes calls this helper.
-- PostgreSQL may evaluate that policy alongside the independent document-manager
-- policy, even when the inserted document has no meeting_id. The meeting recovery
-- migration intentionally revoked direct access to the helper from authenticated,
-- which made otherwise-authorized company/policy document inserts fail with 42501.
--
-- The helper is SECURITY DEFINER but still checks auth.uid(), meeting state, and
-- the caller's meeting permissions. Permit only signed-in callers so the policy
-- can be evaluated; keep PUBLIC and anon explicitly denied.
do $$
begin
  if to_regprocedure('public.meeting_notes_editable(uuid)') is not null then
    execute 'revoke execute on function public.meeting_notes_editable(uuid) from public, anon';
    execute 'grant execute on function public.meeting_notes_editable(uuid) to authenticated';
  end if;
end $$;
