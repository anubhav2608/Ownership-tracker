-- Recording extraction results, and saving extracted purchases.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

insert into public.imports (id, source, title)
values ('a4000000-0000-0000-0000-00000000000a', 'upload', 'invoice.pdf');
insert into public.documents (id, kind, file_name, storage_path, mime_type, size_bytes, source, import_id)
values ('a2000000-0000-0000-0000-00000000000a', 'other', 'invoice.pdf',
        'aaaaaaaa-0000-0000-0000-000000000001/invoice.pdf', 'application/pdf', 100, 'upload',
        'a4000000-0000-0000-0000-00000000000a');

-- ── Processing transitions ───────────────────────────────────────────────
select throws_ok($$
  select public.record_import_result('a4000000-0000-0000-0000-00000000000a', '{"status": "needs_review"}')
$$, 'P0002', null, 'a result can only be recorded while processing');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select is(public.start_import_processing('a4000000-0000-0000-0000-00000000000a'), false,
  'another user can''t start processing your import');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select is(public.start_import_processing('a4000000-0000-0000-0000-00000000000a'), true,
  'the owner can start processing a queued import');
select is(public.start_import_processing('a4000000-0000-0000-0000-00000000000a'), false,
  'an import can''t be processed twice at once');

select throws_ok($$
  select public.record_import_result('a4000000-0000-0000-0000-00000000000a', '{"status": "imported"}')
$$, '22023', null, 'extraction can''t mark an import as imported');

select lives_ok($$
  select public.record_import_result('a4000000-0000-0000-0000-00000000000a', '{
    "status": "needs_review", "stage": "matched", "document_kind": "invoice", "parser": "amazon-in@v1",
    "extracted": {"fields": {"total": {"value": 31489, "state": "extracted", "confidence": 0.95}}},
    "review_reasons": ["Check the date"]}')
$$, 'the owner can record the extraction');
select is(
  (select status::text || ' ' || attempts || ' ' || parser || ' ' || review_reasons[1]
   from public.imports where id = 'a4000000-0000-0000-0000-00000000000a'),
  'needs_review 1 amazon-in@v1 Check the date', 'status, attempt count, parser and reasons are stored'
);
select is(
  (select kind from public.documents where id = 'a2000000-0000-0000-0000-00000000000a'),
  'invoice'::public.document_kind, 'the document takes the detected kind'
);

-- ── Saving the reviewed purchase ─────────────────────────────────────────
select lives_ok($$
  create temp table saved on commit drop as
  select public.create_manual_purchase('{
    "merchant": "Amazon", "order_date": "2026-10-15", "order_ref": "408-1938842-1173903",
    "import_id": "a4000000-0000-0000-0000-00000000000a", "total": 31589,
    "field_meta": {"merchant": {"state": "extracted", "confidence": 0.95}},
    "items": [
      {"name": "Headphones", "category": "electronics", "price": 29990,
       "field_meta": {"price": {"state": "extracted", "confidence": 0.95}},
       "warranty": {"months": 12, "state": "extracted", "evidence": "\"Manufacturer warranty: 1 year\""}},
      {"name": "Case", "category": "accessories", "price": 1499}
    ]}') as r
$$, 'a reviewed extraction saves as a purchase');

select is(
  (select total from public.orders where id = ((select r from saved) ->> 'order_id')::uuid),
  31589.00::numeric, 'an explicit total is kept even when it differs from the items (e.g. shipping)'
);
select is(
  (select field_meta -> 'price' ->> 'state' from public.items where name = 'Headphones'),
  'extracted', 'items remember which values were extracted'
);
select is(
  (select state::text || ' ' || expires_on || ' ' || (document_id is not null)
   from public.warranties w join public.items i on i.id = w.item_id where i.name = 'Headphones'),
  'extracted 2027-10-15 true', 'a stated warranty is stored with its source document'
);
select is_empty($$
  select 1 from public.warranties w join public.items i on i.id = w.item_id where i.name = 'Case'
$$, 'items without a stated warranty get none');

select throws_ok($$
  select public.create_manual_purchase('{
    "merchant": "X", "order_date": "2026-10-15",
    "items": [{"name": "Y", "category": "electronics", "warranty": {"months": 12, "state": "extracted"}}]}')
$$, '23514', null, 'an extracted warranty without evidence is rejected');

select * from finish();
rollback;
