-- Data API privileges are separate from RLS. Keep anonymous access closed while
-- allowing signed-in employees and authorized reviewers to reach the policies
-- created with the attendance regularization workflow.
revoke all on table public.attendance_regularization_requests from anon;
grant select, insert, update on table public.attendance_regularization_requests to authenticated;
grant select, insert, update, delete on table public.attendance_regularization_requests to service_role;
