-- Keep archive checks in the shared predicate so metadata, APIs, storage and
-- projections use the same client boundary across both supported schemas.
create or replace function public.external_patient_access(target_patient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.has_permission('clinician.clients.read') and exists(
 select 1 from public.patients p where p.id=target_patient and p.deleted_at is null
 and (to_jsonb(p)->>'archived_at') is null and p.status::text<>'archived'
 and (exists(select 1 from public.doctor_appointments a where a.patient_id=p.id
 and a.doctor_id=public.current_clinician_id() and a.deleted_at is null)
 or public.patient_is_assigned(p.id,(select auth.uid()))))
$$;

create or replace function public.outsourced_clinician_directory()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_permission('outsourced_clinicians.manage') then raise exception 'Outsourced manager permission required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'doctor_name',d.doctor_name,'profile_id',d.profile_id,
 'availability',coalesce((select jsonb_agg(jsonb_build_object('day_of_week',a.day_of_week,'start_time',a.start_time,'end_time',a.end_time))
 from public.doctor_weekly_availability a where a.doctor_id=d.id),'[]'::jsonb),
 'blocked_periods',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'blocked_date',b.blocked_date,'start_time',b.start_time,'end_time',b.end_time,'reason',b.reason) order by b.blocked_date)
 from public.doctor_blocked_periods b where b.doctor_id=d.id),'[]'::jsonb)) order by d.doctor_name)
 from public.outsourced_doctors d where d.clinician_type='outsourced' and d.status='active' and d.archived_at is null),'[]'::jsonb);
end $$;
create policy "external conversation administration denied" on public.chat_conversations
as restrictive for update to authenticated using(not public.is_external_profile()) with check(not public.is_external_profile());
create policy "external private object reads" on storage.objects as restrictive for select to authenticated
using(not public.is_external_profile() or
 (bucket_id='profile-photos' and public.can_view_clinician_photo(name)) or
 (bucket_id='patient-documents' and exists(select 1 from public.patient_documents d where d.storage_key=objects.name and public.patient_document_access(d))) or
 (bucket_id='chat-attachments' and exists(select 1 from public.chat_messages m where m.attachment_path=objects.name and public.is_chat_member(m.conversation_id))));
create policy "external object replacement denied" on storage.objects as restrictive for update to authenticated
using(not public.is_external_profile()) with check(not public.is_external_profile());
create policy "external object deletion denied" on storage.objects as restrictive for delete to authenticated
using(not public.is_external_profile());
notify pgrst,'reload schema';
