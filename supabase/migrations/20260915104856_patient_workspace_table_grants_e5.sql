-- PostgREST rejects the assigned-client workspace before its patient-scoped
-- RLS policies run when authenticated lacks table-level grants. These grants
-- enable only the operations already guarded by the existing RLS policies.
revoke all on table public.patient_notes, public.patient_sessions, public.patient_activity_logs from public, anon;

grant select, insert, update on table public.patient_notes, public.patient_sessions to authenticated;
grant select on table public.patient_activity_logs to authenticated;
