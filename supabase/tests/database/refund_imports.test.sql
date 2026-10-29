-- Applying a forwarded refund notice to the purchase it's for.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

insert into public.orders (id, merchant, total, source) values
  ('0d000000-0000-0000-0000-000000000001', 'Example Store', 977, 'manual');
insert into public.items (id, order_id, name, category, price) values
  ('1e000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Example Oil', 'home', 220),
  ('1e000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001', 'Example Body Wash', 'home', 503);
insert into public.imports (id, source, title) values
  ('a4000000-0000-0000-0000-000000000001', 'upload', 'Refund on order 402-2222222-2222222'),
  ('a4000000-0000-0000-0000-000000000002', 'upload', 'Refund on order 402-2222222-2222222');
insert into public.documents (id, kind, file_name, storage_path, mime_type, size_bytes, source, import_id)
values ('a2000000-0000-0000-0000-000000000001', 'other', 'refund.pdf',
        'aaaaaaaa-0000-0000-0000-000000000001/refund.pdf', 'application/pdf', 100, 'upload',
        'a4000000-0000-0000-0000-000000000001');

-- Bob can't apply Alice's refund
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 503)
$$, 'P0002', null, 'another user''s purchase is not found');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  select public.apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 503)
$$, 'a refund notice is applied');
select is((select status::text from public.items where id = '1e000000-0000-0000-0000-000000000002'), 'returned', 'the refunded item is returned');
select results_eq(
  $$select status::text, refunded_amount from public.orders where id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('partially_refunded'::text, 503.00::numeric)$$,
  'the money back is on the purchase'
);
select results_eq(
  $$select status::text, result from public.imports where id = 'a4000000-0000-0000-0000-000000000001'$$,
  $$values ('imported'::text, '{"order_id": "0d000000-0000-0000-0000-000000000001", "refund": 503, "refunded_item_ids": ["1e000000-0000-0000-0000-000000000002"]}'::jsonb)$$,
  'the import is saved, pointing at the purchase'
);
select results_eq(
  $$select d.kind::text, l.order_id from public.documents d join public.document_links l on l.document_id = d.id
    where d.id = 'a2000000-0000-0000-0000-000000000001'$$,
  $$values ('refund_notice'::text, '0d000000-0000-0000-0000-000000000001'::uuid)$$,
  'the notice is filed with the purchase'
);
select throws_ok($$
  select public.apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    '{}'::uuid[], 'returned', 10)
$$, 'P0002', null, 'a notice can''t be applied twice');

-- Money back without an item going back
select lives_ok($$
  select public.apply_refund_import('a4000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001',
    '{}'::uuid[], 'returned', 20)
$$, 'a refund without items');
select results_eq(
  $$select o.refunded_amount, (select status::text from public.items where id = '1e000000-0000-0000-0000-000000000001')
    from public.orders o where o.id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values (523.00::numeric, 'owned'::text)$$,
  'adds to the refund and leaves the items owned'
);

select * from finish();
rollback;
