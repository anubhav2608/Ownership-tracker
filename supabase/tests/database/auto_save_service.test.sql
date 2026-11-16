-- A service invoice saved without review, for a signed-in user and for the inbound webhook.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

-- Read and waiting for review (users can only create queued imports; the reader moves them on)
insert into public.imports (id, user_id, source, title, status) values
  ('a5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'upload', 'Invoice', 'needs_review'),
  ('a5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'upload', 'Invoice 2', 'needs_review');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
insert into public.orders (id, merchant, total, source) values ('0d000000-0000-0000-0000-000000000001', 'Example Motors', 745000, 'manual');
insert into public.items (id, order_id, name, category, price) values
  ('1e000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Example Swift', 'vehicle', 745000);

-- Bob can't save into Alice's import by naming her as the owner, or save without owning it
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.auto_save_service_import('a5000000-0000-0000-0000-000000000001',
    '{"item_id":"1e000000-0000-0000-0000-000000000001","service_date":"2026-11-16","work_performed":"Oil change","total_cost":4900,"parts":[]}'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, '42501', null, 'not for someone else');
select throws_ok($$
  select public.auto_save_service_import('a5000000-0000-0000-0000-000000000001',
    '{"service_date":"2026-11-16","work_performed":"Oil change","total_cost":4900,"parts":[]}'::jsonb)
$$, 'P0002', null, 'nor on someone else''s import');

-- Alice's own
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  select public.auto_save_service_import('a5000000-0000-0000-0000-000000000001',
    '{"item_id":"1e000000-0000-0000-0000-000000000001","service_date":"2026-11-16","work_performed":"Oil change","total_cost":4900,"odometer_km":24310,"parts":[{"name":"Oil filter","cost":380,"kind":"part"}]}'::jsonb)
$$, 'a clear service is saved automatically');
select results_eq(
  $$select i.status::text, (i.result ->> 'auto')::boolean, e.odometer_km, e.item_id::text, (select count(*)::int from public.service_event_parts where service_event_id = e.id)
    from public.imports i join public.service_events e on e.import_id = i.id where i.id = 'a5000000-0000-0000-0000-000000000001'$$,
  $$values ('imported'::text, true, 24310, '1e000000-0000-0000-0000-000000000001'::text, 1)$$,
  'saved, marked automatic, on the car, with its parts'
);
select throws_ok($$
  select public.auto_save_service_import('a5000000-0000-0000-0000-000000000001',
    '{"service_date":"2026-11-16","work_performed":"Again","total_cost":1,"parts":[]}'::jsonb)
$$, 'P0002', null, 'and only once per import');

-- As the inbound webhook (service role, no signed-in user)
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select lives_ok($$
  select public.auto_save_service_import('a5000000-0000-0000-0000-000000000002',
    '{"item_id":"1e000000-0000-0000-0000-000000000001","service_date":"2026-11-16","work_performed":"Wash","total_cost":300,"parts":[]}'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001')
$$, 'the webhook saves it for the email''s owner');
select * from finish();
rollback;
