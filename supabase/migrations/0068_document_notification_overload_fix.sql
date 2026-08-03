-- Disambiguate document notifications after the extended notify_user overload
-- was introduced for notification preferences and sounds.
create or replace function public.notify_document_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  req record;
begin
  if TG_TABLE_NAME = 'document_requests' and TG_OP = 'INSERT' then
    perform public.notify_user(
      new.profile_id,
      'Document requested'::text,
      'A document has been requested from you.'::text,
      'document_requested'::text,
      new.id,
      '/employee/documents'::text,
      new.requested_by,
      'documents'::text,
      'normal'::text,
      'none'::text,
      false
    );
  elsif TG_TABLE_NAME = 'document_requests' and new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify_user(
      new.profile_id,
      ('Document ' || new.status)::text,
      ('Your document submission was ' || new.status || '.')::text,
      ('document_' || new.status)::text,
      new.id,
      '/employee/documents'::text,
      new.reviewer_id,
      'documents'::text,
      'normal'::text,
      case when new.status = 'approved' then 'success' else 'warning' end::text,
      false
    );
  elsif TG_TABLE_NAME = 'document_submissions' then
    select * into req from public.document_requests where id = new.request_id;
    perform public.notify_user(
      req.requested_by,
      'Document submitted'::text,
      'An employee submitted a requested document.'::text,
      'document_submitted'::text,
      new.request_id,
      '/admin/documents'::text,
      new.submitted_by,
      'documents'::text,
      'normal'::text,
      'none'::text,
      false
    );
  end if;
  return new;
end
$$;
