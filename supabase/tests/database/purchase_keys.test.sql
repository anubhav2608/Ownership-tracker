-- Order and invoice numbers identify a purchase; replacing an existing one.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

create temp table first_save on commit drop as
select public.create_manual_purchase('{
  "merchant": "Myntra", "order_date": "2026-09-14",
  "order_ref": "1000001-2000002-3000003", "invoice_ref": "F0101XX000000001",
  "items": [{"name": "Hoodie", "category": "clothing", "price": 899}]}') as r;
select ok((select r ? 'order_id' from first_save), 'a purchase with order and invoice numbers saves');

insert into public.imports (id, source, title) values ('a6000000-0000-0000-0000-000000000001', 'upload', 'old.pdf');
update public.orders set import_id = 'a6000000-0000-0000-0000-000000000001'
where id = ((select r from first_save) ->> 'order_id')::uuid;
insert into public.service_events (item_id, service_date, work_performed, total_cost)
select id, '2026-10-01', 'Alteration', 150 from public.items where name = 'Hoodie';

select throws_ok($$
  select public.create_manual_purchase('{
    "merchant": "Myntra", "order_date": "2026-09-14", "order_ref": " 1000001-2000002-3000003 ",
    "items": [{"name": "Hoodie", "category": "clothing"}]}')
$$, 'OT409', null, 'the same order number can''t be saved twice');

select throws_ok($$
  select public.create_manual_purchase('{
    "merchant": "Myntra", "order_date": "2026-09-14", "invoice_ref": "f0101xx000000001",
    "items": [{"name": "Hoodie", "category": "clothing"}]}')
$$, 'OT409', null, 'nor the same invoice number, whatever its case');

select throws_ok($$
  select public.create_manual_purchase('{
    "merchant": "Myntra", "order_date": "2026-09-14", "order_ref": "1000001-2000002-3000003",
    "replace_order_id": "a6000000-0000-0000-0000-0000000000ff",
    "items": [{"name": "Hoodie", "category": "clothing"}]}')
$$, 'OT409', null, 'replacing needs the id of the purchase that actually conflicts');

select throws_ok($$
  insert into public.orders (merchant, order_date, order_ref, source) values ('X', '2026-01-01', '1000001-2000002-3000003', 'manual')
$$, '23505', null, 'the database enforces it too');

select lives_ok($$
  select public.create_manual_purchase('{
    "merchant": "Plain", "order_date": "2026-09-15",
    "items": [{"name": "Socks", "category": "clothing"}]}')
$$, 'purchases without numbers are unaffected');

create temp table replaced on commit drop as
select public.create_manual_purchase(jsonb_build_object(
  'merchant', 'Myntra', 'order_date', '2026-09-14',
  'order_ref', '1000001-2000002-3000003', 'invoice_ref', 'F0101XX000000001', 'total', 2418,
  'replace_order_id', (select r ->> 'order_id' from first_save),
  'items', '[{"name": "Hoodie (M)", "category": "clothing", "price": 899},
             {"name": "Denim Jacket", "category": "clothing", "price": 1499}]'::jsonb)) as r;

select is_empty($$ select 1 from public.orders where id = ((select r from first_save) ->> 'order_id')::uuid $$,
  'replacing removes the old purchase');
select is_empty($$ select 1 from public.items where name = 'Hoodie' $$, 'and its items');
select is_empty($$ select 1 from public.service_events where work_performed = 'Alteration' $$,
  'and their service history');
select is_empty($$ select 1 from public.imports where id = 'a6000000-0000-0000-0000-000000000001' $$,
  'and the import it came from');
select is(
  (select total from public.orders where id = ((select r from replaced) ->> 'order_id')::uuid),
  2418.00::numeric, 'the new purchase takes its place'
);

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select lives_ok($$
  select public.create_manual_purchase('{
    "merchant": "Myntra", "order_date": "2026-09-14", "order_ref": "1000001-2000002-3000003",
    "items": [{"name": "Hoodie", "category": "clothing"}]}')
$$, 'another user''s numbers don''t conflict');

select * from finish();
rollback;
