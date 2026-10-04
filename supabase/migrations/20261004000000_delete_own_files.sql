-- Let users delete their own files, so removing an item from the app also
-- removes its photo and generated images.
create policy "own files: delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'items' and (storage.foldername(name))[1] = auth.uid()::text
  );
