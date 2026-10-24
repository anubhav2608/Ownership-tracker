-- Manual purchases and service events, including saving them from an import.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

-- ── A purchase entered by hand ───────────────────────────────────────────
select lives_ok($$
  create temp table plain on commit drop as
  select public.create_manual_purchase('{
    "merchant": "Croma", "order_date": "2026-10-01", "order_ref": "CRM-1",
    "items": [
      {"name": "Refrigerator", "category": "appliances", "price": 42000},
      {"name": "Stabiliser", "category": "appliances", "price": 2500}
    ]}') as r
$$, 'a user can save a purchase with several items');

select is(
  (select total from public.orders where id = ((select r from plain) ->> 'order_id')::uuid),
  44500.00::numeric, 'the order total is the sum of the item prices'
);
select is(
  (select count(*)::int from public.items where order_id = ((select r from plain) ->> 'order_id')::uuid),
  2, 'each line becomes an item on the order'
);
select is(
  (select source from public.orders where id = ((select r from plain) ->> 'order_id')::uuid),
  'manual'::public.record_source, 'a purchase without an import is marked manual'
);
select throws_ok($$
  select public.create_manual_purchase('{"merchant": "X", "order_date": "2026-10-01", "items": []}')
$$, '22023', null, 'a purchase needs at least one item');

-- ── A purchase saved from an uploaded document ──────────────────────────
insert into public.imports (id, source, title)
values ('a4000000-0000-0000-0000-00000000000a', 'upload', 'invoice.pdf');
insert into public.documents (id, kind, file_name, storage_path, mime_type, size_bytes, source, import_id)
values ('a2000000-0000-0000-0000-00000000000a', 'other', 'invoice.pdf',
        'aaaaaaaa-0000-0000-0000-000000000001/invoice.pdf', 'application/pdf', 100, 'upload',
        'a4000000-0000-0000-0000-00000000000a');

-- Bob can't save a purchase from Alice's import; the whole save is rolled back.
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.create_manual_purchase('{
    "merchant": "Sneaky", "order_date": "2026-10-01", "import_id": "a4000000-0000-0000-0000-00000000000a",
    "items": [{"name": "Thing", "category": "electronics"}]}')
$$, '23503', null, 'cannot save a purchase from another user''s import');
select is_empty('select 1 from public.orders', 'the failed save left no purchase behind');
select throws_ok($$
  select public.mark_import_saved('a4000000-0000-0000-0000-00000000000a', '{}')
$$, 'P0002', null, 'cannot mark another user''s import as saved');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  create temp table from_import on commit drop as
  select public.create_manual_purchase('{
    "merchant": "Amazon", "order_date": "2026-10-15", "import_id": "a4000000-0000-0000-0000-00000000000a",
    "items": [
      {"name": "Headphones", "category": "electronics", "price": 29990},
      {"name": "Case", "category": "accessories", "price": 1499}
    ]}') as r
$$, 'a user can save a purchase from their own import');

select is(
  (select status from public.imports where id = 'a4000000-0000-0000-0000-00000000000a'),
  'imported'::public.import_status, 'the import is marked imported'
);
select is(
  (select result ->> 'order_id' from public.imports where id = 'a4000000-0000-0000-0000-00000000000a'),
  (select r ->> 'order_id' from from_import), 'the import records which purchase it became'
);
select is(
  (select count(*)::int from public.document_links where document_id = 'a2000000-0000-0000-0000-00000000000a'),
  3, 'the document is attached to the purchase and to both items'
);
select is(
  (select kind from public.documents where id = 'a2000000-0000-0000-0000-00000000000a'),
  'invoice'::public.document_kind, 'the document is recognised as an invoice'
);
select throws_ok($$
  select public.mark_import_saved('a4000000-0000-0000-0000-00000000000a', '{}')
$$, 'P0002', null, 'an import can only be saved once');

-- ── Service events ───────────────────────────────────────────────────────
select lives_ok($$
  create temp table svc on commit drop as
  select public.create_manual_service_event(jsonb_build_object(
    'item_id', (select id from public.items where name = 'Refrigerator'),
    'service_date', '2026-10-20', 'work_performed', 'Gas refill', 'provider', 'Urban Company',
    'total_cost', 1800, 'labour_cost', 600,
    'parts', '[{"name": "Refrigerant", "cost": 1200}, {"name": " "}]'::jsonb)) as r
$$, 'a user can add a service event with parts to their item');
select is(
  (select count(*)::int from public.service_event_parts
   where service_event_id = ((select r from svc) ->> 'service_event_id')::uuid),
  1, 'blank part rows are skipped'
);

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.create_manual_service_event(jsonb_build_object(
    'item_id', 'a1000000-0000-0000-0000-00000000000a', 'service_date', '2026-10-20',
    'work_performed', 'Sneaky', 'total_cost', 0))
$$, '23503', null, 'cannot add a service event to an item that isn''t yours');

select * from finish();
rollback;
