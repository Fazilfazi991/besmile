begin;

-- This helper is called only from permission-checked appointment RPCs. It accepts
-- caller-controlled audit identity and metadata, so it must not be a Data API RPC.
revoke all on function public.log_doctor_appointment_patient_activity(uuid, uuid, text, uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.log_doctor_appointment_patient_activity(uuid, uuid, text, uuid, jsonb)
to service_role;

notify pgrst, 'reload schema';

commit;
