-- Forwarded emails: held senders, stuck reads, and where saved purchases came from.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

-- The webhook (service role) writes email imports; users can't.
insert into public.imports (id, user_id, source, title, from_email, status, error, inbound_event_id, updated_at) values
  ('a5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'email',
   'Your Amazon.in order', 'Orders@Shop.example', 'failed',
   '{"code": "SENDER_NOT_VERIFIED", "message": "held", "stage": "verified", "retryable": false}', 'msg_1', now()),
  ('a5000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'email',
   'Your Flipkart order', 'orders@shop.example', 'failed',
   '{"code": "SENDER_NOT_VERIFIED", "message": "held", "stage": "verified", "retryable": false}', 'msg_2', now()),
  ('a5000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'email',
   'Service receipt', 'alice@example.com', 'processing', null, 'msg_3', now() - interval '10 minutes');

select throws_ok($$
  insert into public.imports (user_id, source, title, inbound_event_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'email', 'again', 'msg_1')
$$, '23505', null, 'a redelivered webhook can''t create a second import');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$ select public.approve_import_sender('a5000000-0000-0000-0000-000000000001') $$,
  'P0002', null, 'another user can''t approve your sender');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select throws_ok($$ select public.approve_import_sender('a5000000-0000-0000-0000-000000000003') $$,
  'P0002', null, 'only imports held for their sender can be approved');

select is(public.approve_import_sender('a5000000-0000-0000-0000-000000000001'), 'orders@shop.example',
  'the owner can trust the sender of a held email');
select ok(
  (select verified_at is not null from public.verified_senders where email = 'orders@shop.example'),
  'the sender is now verified'
);
select is(
  (select array_agg(status::text order by id) from public.imports
   where id in ('a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002')),
  array['queued', 'queued'], 'every message held for that sender is queued to be read'
);
select is(
  (select count(*)::int from public.imports where error is not null and status <> 'failed'), 0,
  'queued imports carry no error'
);

select throws_ok($$
  insert into public.verified_senders (email, verified_at) values ('x@example.com', now())
$$, '42501', null, 'users still can''t mark a sender verified directly');

select is(public.start_import_processing('a5000000-0000-0000-0000-000000000003'), true,
  'a read stuck for over five minutes can be started again');
select is(public.start_import_processing('a5000000-0000-0000-0000-000000000003'), false,
  'but not one that just started');

create temp table saved on commit drop as
select public.create_manual_purchase('{
  "merchant": "Amazon", "order_date": "2026-10-15",
  "import_id": "a5000000-0000-0000-0000-000000000001",
  "items": [{"name": "Kettle", "category": "home", "price": 1299}]}') as r;
select is(
  (select source::text from public.orders where id = ((select r from saved) ->> 'order_id')::uuid),
  'email', 'a purchase saved from a forwarded email is marked as email'
);

select * from finish();
rollback;
