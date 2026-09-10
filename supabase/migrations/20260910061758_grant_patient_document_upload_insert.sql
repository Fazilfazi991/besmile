-- Expose only INSERT to the Data API. Existing patient-scoped RLS remains authoritative.
grant insert on table public.patient_documents to authenticated;
