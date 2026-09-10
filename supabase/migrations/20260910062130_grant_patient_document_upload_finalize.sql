-- The canonical upload route finalizes storage_key/checksum after private storage upload.
-- Existing upload-finalize and document-change RLS policies still authorize each row.
grant update on table public.patient_documents to authenticated;
