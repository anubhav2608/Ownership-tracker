-- One email, several orders: one purchase each.
begin;
select plan(6);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
insert into public.imports (id, source, title) values ('a4000000-0000-0000-0000-000000000001', 'upload', 'Ordered: 3 items');
insert into public.documents (id, kind, file_name, storage_path, mime_type, size_bytes, source, import_id)
values ('a2000000-0000-0000-0000-000000000001', 'other', 'order.pdf', 'aaaaaaaa-0000-0000-0000-000000000001/o.pdf', 'application/pdf', 100, 'upload',
        'a4000000-0000-0000-0000-000000000001');

select lives_ok($$
  create temp table made on commit drop as
  select public.create_purchases_from_import('a4000000-0000-0000-0000-000000000001', '[
    {"merchant": "Amazon", "order_date": "2026-10-07", "order_ref": "402-1111111-1111111", "total": 221.15,
     "items": [{"name": "Example Oil", "category": "home", "price": 220}]},
    {"merchant": "Amazon", "order_date": "2026-10-07", "order_ref": "402-2222222-2222222", "total": 505.55,
     "items": [{"name": "Example Body Wash", "category": "home", "price": 503, "warranty": {"months": 6}}]}
  ]') as r
$$, 'an email with two orders is saved');
select results_eq(
  $$select order_ref, total, source::text, import_id from public.orders order by order_ref$$,
  $$values ('402-1111111-1111111'::text, 221.15::numeric, 'upload'::text, 'a4000000-0000-0000-0000-000000000001'::uuid),
           ('402-2222222-2222222'::text, 505.55::numeric, 'upload'::text, 'a4000000-0000-0000-0000-000000000001'::uuid)$$,
  'as two purchases, each with its own order number and total, from the import'
);
select is((select count(*)::int from public.document_links where order_id is not null), 2, 'the email is filed with both');
select is((select document_id from public.warranties), 'a2000000-0000-0000-0000-000000000001'::uuid, 'warranties point to it');
select results_eq(
  $$select status::text, jsonb_array_length(result -> 'order_ids'), jsonb_array_length(result -> 'item_ids') from public.imports$$,
  $$values ('imported'::text, 2, 2)$$,
  'the import is saved once, with every purchase'
);

-- One order number that already exists: nothing is saved.
insert into public.imports (id, source, title) values ('a4000000-0000-0000-0000-000000000002', 'upload', 'Again');
select throws_ok($$
  select public.create_purchases_from_import('a4000000-0000-0000-0000-000000000002', '[
    {"merchant": "Amazon", "order_date": "2026-10-07", "order_ref": "402-3333333-3333333", "items": [{"name": "New", "category": "home"}]},
    {"merchant": "Amazon", "order_date": "2026-10-07", "order_ref": "402-1111111-1111111", "items": [{"name": "Dup", "category": "home"}]}
  ]')
$$, 'OT409', null, 'an existing order number refuses the whole save');

select * from finish();
rollback;
