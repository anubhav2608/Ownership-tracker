-- An order or invoice saved without review, for a signed-in user and for the inbound webhook.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

-- Read and waiting for review (users can only create queued imports; the reader moves them on)
insert into public.imports (id, user_id, source, title, status) values
  ('a6000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'upload', 'Croma invoice', 'needs_review'),
  ('a6000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Two orders', 'needs_review'),
  ('a6000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'email', 'Croma again', 'needs_review');

set local role authenticated;

-- Bob can't save into Alice's import by naming her as the owner, or save without owning it
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000001',
    '[{"merchant":"Croma","order_date":"2026-11-01","order_ref":"CR-1","items":[{"name":"TV","category":"electronics","price":52990}]}]'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, '42501', null, 'not for someone else');
select throws_ok($$
  select public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000001',
    '[{"merchant":"Croma","order_date":"2026-11-01","order_ref":"CR-1","items":[{"name":"TV","category":"electronics","price":52990}]}]'::jsonb)
$$, 'P0002', null, 'nor on someone else''s import');

-- Alice's own
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  select public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000001',
    '[{"merchant":"Croma","order_date":"2026-11-01","order_ref":"CR-1","total":52990,"field_meta":{"merchant":{"state":"extracted","confidence":0.7}},
       "items":[{"name":"TV","category":"electronics","price":52990,"return_by":"2026-11-08","field_meta":{},
                 "warranty":{"months":12,"state":"extracted","evidence":"1 year warranty"}}]}]'::jsonb)
$$, 'a clear purchase is saved automatically');
select results_eq(
  $$select i.status::text, (i.result ->> 'auto')::boolean, o.merchant, o.order_ref, o.import_id is not null,
           (select count(*)::int from public.items it where it.order_id = o.id),
           (select w.state::text from public.warranties w join public.items it on it.id = w.item_id where it.order_id = o.id)
      from public.imports i join public.orders o on o.id = (i.result ->> 'order_id')::uuid
     where i.id = 'a6000000-0000-0000-0000-000000000001'$$,
  $$values ('imported'::text, true, 'Croma'::text, 'CR-1'::text, true, 1, 'extracted'::text)$$,
  'saved, marked automatic, tied to the import, with its item and warranty'
);
select throws_ok($$
  select public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000001',
    '[{"merchant":"Croma","order_date":"2026-11-01","items":[{"name":"Again","category":"electronics"}]}]'::jsonb)
$$, 'P0002', null, 'and only once per import');

-- The same order number again is refused, so that email waits for review
select throws_ok($$
  select public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000003',
    '[{"merchant":"Croma","order_date":"2026-11-01","order_ref":"CR-1","items":[{"name":"TV","category":"electronics","price":52990}]}]'::jsonb)
$$, 'OT409', null, 'a purchase already saved is not saved twice');
select is((select status::text from public.imports where id = 'a6000000-0000-0000-0000-000000000003'), 'needs_review', 'and waits for review');

-- As the inbound webhook (service role, no signed-in user): one purchase per order
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select results_eq($$
  select jsonb_array_length(public.auto_save_purchase_import('a6000000-0000-0000-0000-000000000002',
    '[{"merchant":"Myntra","order_date":"2026-11-02","order_ref":"M-1","total":999,"items":[{"name":"Shirt","category":"clothing","price":999}]},
      {"merchant":"Myntra","order_date":"2026-11-02","order_ref":"M-2","total":2999,"items":[{"name":"Shoes","category":"clothing","price":2999}]}]'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001') -> 'order_ids')
$$, $$values (2)$$, 'the webhook saves each order for the email''s owner');
select * from finish();
rollback;
