-- Returning or cancelling items, and refunds on the order.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

insert into public.orders (id, merchant, total, source) values
  ('0d000000-0000-0000-0000-000000000001', 'Example Store', 3148, 'manual'),
  ('0d000000-0000-0000-0000-000000000002', 'Example Store', 899, 'manual');
insert into public.items (id, order_id, name, category, price) values
  ('1e000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Sample Earbuds', 'electronics', 2499),
  ('1e000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001', 'Sample Drum', 'toys', 599),
  ('1e000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000002', 'Sample Lamp', 'home', 899);

-- One item returned, with its price back
select lives_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000001']::uuid[], 'returned', 2499)
$$, 'an item can be returned with a refund');
select is((select status::text from public.items where id = '1e000000-0000-0000-0000-000000000001'), 'returned', 'the item is returned');
select is((select status::text from public.items where id = '1e000000-0000-0000-0000-000000000002'), 'owned', 'the other item is still owned');
select results_eq(
  $$select status::text, refunded_amount from public.orders where id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('partially_refunded'::text, 2499.00::numeric)$$,
  'the order is partly refunded'
);

-- The rest back: refunded, never more than the total
select lives_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 5000)
$$, 'the other item too');
select results_eq(
  $$select status::text, refunded_amount from public.orders where id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('refunded'::text, 3148.00::numeric)$$,
  'fully refunded, capped at the total'
);

-- Correcting the refund
select lives_ok($$select public.set_order_refund('0d000000-0000-0000-0000-000000000001', 0)$$, 'the refund can be corrected');
select results_eq(
  $$select status::text, refunded_amount from public.orders where id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('completed'::text, null::numeric)$$,
  'no refund: back to completed'
);

-- A whole order cancelled, nothing charged back yet
select lives_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000002', '{}'::uuid[], 'cancelled', 0)
$$, 'a whole order can be cancelled');
select results_eq(
  $$select o.status::text, i.status::text from public.orders o join public.items i on i.order_id = o.id
    where o.id = '0d000000-0000-0000-0000-000000000002'$$,
  $$values ('cancelled'::text, 'cancelled'::text)$$,
  'the order and its items are cancelled'
);

-- Bad input
select throws_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000003']::uuid[], 'returned', 0)
$$, '22023', null, 'items from another order are refused');
select throws_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000001', '{}'::uuid[], 'sold', 0)
$$, '22023', null, 'only returned or cancelled');
select throws_ok($$select public.set_order_refund('0d000000-0000-0000-0000-000000000001', -1)$$, '22023', null, 'no negative refunds');

-- Someone else's order
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.record_purchase_outcome('0d000000-0000-0000-0000-000000000001', '{}'::uuid[], 'returned', 0)
$$, 'P0002', null, 'another user''s order is not found');

select * from finish();
rollback;
