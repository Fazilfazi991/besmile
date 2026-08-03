-- Repair live document request/submission schema drift used by the document
-- center and employee requested-document upload workflow.
alter table public.document_requests
  add column if not exists due_date date,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.document_submissions
  add column if not exists mime_type text,
  add column if not exists file_size bigint check (file_size is null or file_size >= 0);
