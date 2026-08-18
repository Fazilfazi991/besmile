-- `documents` has an INSERT policy for post-meeting host documents that calls
-- this helper. PostgreSQL evaluates the helper while combining applicable
-- permissive policies, including when another policy authorizes an official
-- document with no meeting_id. The helper itself is SECURITY DEFINER and
-- checks auth.uid(), meeting state, and the caller's meeting permissions, so
-- authenticated callers need EXECUTE for the policy to be evaluable.
--
-- Do not grant PUBLIC or anon: this keeps the helper unavailable to unauthenticated
-- callers while restoring the intended policy path for signed-in users.
grant execute on function public.meeting_notes_editable(uuid) to authenticated;
