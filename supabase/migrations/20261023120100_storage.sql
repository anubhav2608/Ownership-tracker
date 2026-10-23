-- Private storage for user documents and raw inbound mail.

-- documents: invoices, receipts and warranty cards. Path: <user_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'message/rfc822'
  ]
);

-- inbound-raw: the original forwarded messages, kept for reprocessing and
-- diagnosis. Only the server (service role) reads or writes it, so it has no
-- policies for signed-in users.
insert into storage.buckets (id, name, public, file_size_limit)
values ('inbound-raw', 'inbound-raw', false, 25 * 1024 * 1024);

-- Users can read, upload and delete files in their own folder of "documents".
-- No update policy: stored documents are immutable; replace by delete + upload.
create policy "Users read their documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users upload to their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
