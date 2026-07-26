-- Employees may remove only their own protected profile photo.
drop policy if exists "profile photo delete" on storage.objects;
create policy "profile photo delete" on storage.objects for delete to authenticated using(
  bucket_id='profile-photos' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
);
