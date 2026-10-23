-- Data isolation, permissions and integrity rules. Run with `npx supabase test db`
-- (or scripts/db/test-local.sh without Docker).
begin;
select plan(46);

-- Two users. The signup trigger gives each a profile and a verified sender.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice@Example.com', '{"full_name": "Alice"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com', '{}');

select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Alice', 'signup creates a profile with the display name'
);
select matches(
  (select forwarding_token from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '^u_[0-9a-f]{16}$', 'signup assigns a random forwarding token'
);
select is(
  (select email from public.verified_senders
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and verified_at is not null),
  'alice@example.com', 'signup email becomes a verified sender, lower-cased'
);

-- ── Alice creates records ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select lives_ok($$
  insert into public.orders (id, merchant, order_ref, order_date, total, source)
  values ('a0000000-0000-0000-0000-00000000000a', 'Hyundai Motors Dealer', 'HMD-1', '2024-01-20', 1765000, 'manual')
$$, 'a user can create a purchase');

select lives_ok($$
  insert into public.items (id, order_id, name, brand, category, purchase_date, price, identifiers, field_meta)
  values (
    'a1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a',
    'Hyundai Creta', 'Hyundai', 'vehicle', '2024-01-20', 1765000,
    '[{"label": "Registration", "value": "KA 03 MX 1234"}]',
    '{"price": {"state": "extracted", "confidence": 0.97}}'
  )
$$, 'a user can add an item to their purchase');

select is(
  (select user_id from public.items where id = 'a1000000-0000-0000-0000-00000000000a'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'user_id defaults to the signed-in user'
);

select ok(
  (select search_text like '%ka 03 mx 1234%' from public.items where id = 'a1000000-0000-0000-0000-00000000000a'),
  'item search text includes identifier values'
);

select lives_ok($$
  insert into public.documents (id, kind, file_name, storage_path, mime_type, size_bytes, source)
  values ('a2000000-0000-0000-0000-00000000000a', 'invoice', 'creta.pdf',
          'aaaaaaaa-0000-0000-0000-000000000001/creta.pdf', 'application/pdf', 1000, 'upload')
$$, 'a user can register a document in their folder');

select lives_ok($$
  insert into public.service_events (id, item_id, service_date, provider, work_performed, total_cost, odometer_km)
  values ('a3000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
          '2025-01-18', 'Hyundai Service', 'Periodic service', 6420, 10140);
  insert into public.service_event_parts (service_event_id, name, cost)
  values ('a3000000-0000-0000-0000-00000000000a', 'Oil filter', 420);
  insert into public.warranties (item_id, months, starts_on, expires_on, provider, state, evidence, document_id)
  values ('a1000000-0000-0000-0000-00000000000a', 36, '2024-01-20', '2027-01-20', 'Hyundai',
          'extracted', 'Invoice: "3 years"', 'a2000000-0000-0000-0000-00000000000a');
  insert into public.document_links (document_id, item_id)
  values ('a2000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a');
$$, 'a user can add service events, parts, a warranty and document links');

select lives_ok($$
  insert into storage.objects (bucket_id, name)
  values ('documents', 'aaaaaaaa-0000-0000-0000-000000000001/creta.pdf')
$$, 'a user can upload into their own storage folder');

-- ── Bob cannot see or touch Alice's data ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);

select is_empty('select 1 from public.orders', 'other users'' purchases are invisible');
select is_empty('select 1 from public.items', 'other users'' items are invisible');
select is_empty('select 1 from public.service_events', 'other users'' service events are invisible');
select is_empty('select 1 from public.service_event_parts', 'other users'' parts are invisible');
select is_empty('select 1 from public.warranties', 'other users'' warranties are invisible');
select is_empty('select 1 from public.documents', 'other users'' documents are invisible');
select is_empty('select 1 from public.document_links', 'other users'' document links are invisible');
select is_empty(
  $$select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'other users'' profiles (and forwarding tokens) are invisible'
);
select is_empty('select 1 from storage.objects', 'other users'' files are invisible');

select is_empty($$
  update public.items set name = 'hacked' where id = 'a1000000-0000-0000-0000-00000000000a' returning 1
$$, 'other users'' items cannot be updated');
select is_empty($$
  delete from public.orders where id = 'a0000000-0000-0000-0000-00000000000a' returning 1
$$, 'other users'' purchases cannot be deleted');

select throws_ok($$
  insert into public.items (order_id, name, category)
  values ('a0000000-0000-0000-0000-00000000000a', 'Sneaky item', 'electronics')
$$, '23503', null, 'cannot attach an item to another user''s purchase');
select throws_ok($$
  insert into public.service_events (item_id, service_date, work_performed)
  values ('a1000000-0000-0000-0000-00000000000a', '2026-01-01', 'Sneaky service')
$$, '23503', null, 'cannot add a service event to another user''s item');
select throws_ok($$
  insert into public.items (user_id, name, category)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Planted item', 'electronics')
$$, '42501', null, 'cannot create rows owned by another user');
select throws_ok($$
  insert into storage.objects (bucket_id, name)
  values ('documents', 'aaaaaaaa-0000-0000-0000-000000000001/planted.pdf')
$$, '42501', null, 'cannot upload into another user''s storage folder');
select throws_ok($$
  select public.retry_import('a4000000-0000-0000-0000-00000000000a')
$$, 'P0002', null, 'cannot retry another user''s import');

-- ── Alice's own permission limits ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select throws_ok($$
  insert into public.verified_senders (email, verified_at) values ('me@work.example', now())
$$, '42501', null, 'users cannot mark a sender as verified themselves');
select lives_ok($$
  insert into public.verified_senders (email) values ('me@work.example')
$$, 'users can add an unverified sender');
select throws_ok($$
  update public.verified_senders set verified_at = now()
$$, '42501', null, 'users cannot verify senders by updating');

select throws_ok($$
  update public.profiles set forwarding_token = 'u_chosenbyme00000'
$$, '42501', null, 'users cannot choose their own forwarding token');
select lives_ok($$
  update public.profiles set display_name = 'Alice B'
$$, 'users can rename themselves');
select matches(
  public.regenerate_forwarding_token(), '^u_[0-9a-f]{16}$',
  'users can regenerate their forwarding token'
);

select lives_ok($$
  insert into public.imports (source, title) values ('upload', 'receipt.jpg')
$$, 'users can queue an upload import');
select throws_ok($$
  insert into public.imports (source, title, status, stage) values ('upload', 'x.jpg', 'imported', 'saved')
$$, '42501', null, 'users cannot create already-processed imports');
select throws_ok($$
  update public.imports set status = 'imported'
$$, '42501', null, 'users cannot change import status directly');

-- ── Integrity rules ──────────────────────────────────────────────────────
select throws_ok($$
  insert into public.items (name, category, field_meta)
  values ('Bad meta', 'electronics', '{"price": {"state": "guessed"}}')
$$, '23514', null, 'field_meta only accepts missing / extracted / confirmed');
select throws_ok($$
  insert into public.items (id, name, category) values ('a1000000-0000-0000-0000-00000000000b', 'Phone', 'electronics');
  insert into public.warranties (item_id, months, starts_on, expires_on, state)
  values ('a1000000-0000-0000-0000-00000000000b', 12, '2026-01-01', '2027-01-01', 'extracted')
$$, '23514', null, 'an extracted warranty must cite its evidence');
select throws_ok($$
  insert into public.documents (kind, file_name, storage_path, mime_type, size_bytes, source)
  values ('invoice', 'x.pdf', 'bbbbbbbb-0000-0000-0000-000000000002/x.pdf', 'application/pdf', 1, 'upload')
$$, '23514', null, 'document paths must be inside the owner''s folder');

-- ── Pipeline (service role) behaviour ───────────────────────────────────
reset role;
set local role service_role;

select lives_ok($$
  insert into public.imports (id, user_id, source, title, message_id, status, stage, attempts, error)
  values ('a4000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001',
          'upload', 'blurry.heic', null, 'failed', 'text_extracted', 2,
          '{"code": "OCR_LOW_QUALITY", "retryable": true}');
  insert into public.imports (id, user_id, source, title, message_id, status, stage)
  values ('a5000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001',
          'email', 'Order 1', '<msg-1@shop>', 'imported', 'saved');
$$, 'the pipeline can write imports for any user');
select throws_ok($$
  insert into public.imports (user_id, source, title, message_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Order 1 again', '<msg-1@shop>')
$$, '23505', null, 'the same Message-ID cannot be imported twice');
select lives_ok($$
  insert into public.imports (user_id, source, title, message_id, status, duplicate_of)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Order 1 again', '<msg-1@shop>',
          'duplicate', 'a5000000-0000-0000-0000-00000000000a')
$$, 'a re-forwarded message is recorded as a duplicate of the original');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select is(
  (public.retry_import('a4000000-0000-0000-0000-00000000000a')).status,
  'queued'::public.import_status, 'owners can retry a retryable failed import'
);
select throws_ok($$
  select public.retry_import('a5000000-0000-0000-0000-00000000000a')
$$, 'P0002', null, 'imports that did not fail cannot be retried');

select lives_ok($$
  delete from public.orders where id = 'a0000000-0000-0000-0000-00000000000a'
$$, 'owners can delete a purchase');
select is_empty($$
  select 1 from public.service_events where item_id = 'a1000000-0000-0000-0000-00000000000a'
$$, 'deleting a purchase removes its items and their service history');

-- ── Signed-out visitors get nothing ──────────────────────────────────────
reset role;
set local role anon;
select throws_ok('select 1 from public.items', '42501', null, 'signed-out visitors cannot read items');

select * from finish();
rollback;
