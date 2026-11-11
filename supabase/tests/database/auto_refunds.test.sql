-- Refunds applied automatically, and undone.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
insert into public.orders (id, merchant, total, source) values ('0d000000-0000-0000-0000-000000000001', 'Example Store', 977, 'manual');
insert into public.items (id, order_id, name, category, price) values
  ('1e000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Example Oil', 'home', 220),
  ('1e000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001', 'Example Body Wash', 'home', 503);
insert into public.imports (id, source, title) values
  ('a4000000-0000-0000-0000-000000000001', 'upload', 'Refund'),
  ('a4000000-0000-0000-0000-000000000002', 'upload', 'Refund again');

-- Bob can't apply Alice's refund by naming her as the owner
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.auto_apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 503, null, 'aaaaaaaa-0000-0000-0000-000000000001')
$$, '42501', null, 'not for someone else');
select throws_ok($$
  select public.auto_apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 503)
$$, 'P0002', null, 'nor on someone else''s purchase');

-- Alice's own
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  select public.auto_apply_refund_import('a4000000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000002']::uuid[], 'returned', 503, '2026-10-20')
$$, 'a clear refund is applied automatically');
select results_eq(
  $$select i.status::text, (i.result ->> 'auto')::boolean, o.refunded_amount, (select status::text from public.items where id = '1e000000-0000-0000-0000-000000000002')
    from public.imports i, public.orders o where i.id = 'a4000000-0000-0000-0000-000000000001' and o.id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('imported'::text, true, 503.00::numeric, 'returned'::text)$$,
  'saved, marked automatic, refund on the purchase, item returned'
);

-- Undo
select lives_ok($$select public.undo_refund_import('a4000000-0000-0000-0000-000000000001')$$, 'it can be undone');
select results_eq(
  $$select i.status::text, i.result, o.status::text, o.refunded_amount, (select status::text from public.items where id = '1e000000-0000-0000-0000-000000000002')
    from public.imports i, public.orders o where i.id = 'a4000000-0000-0000-0000-000000000001' and o.id = '0d000000-0000-0000-0000-000000000001'$$,
  $$values ('needs_review'::text, null::jsonb, 'completed'::text, null::numeric, 'owned'::text)$$,
  'back to review, the purchase and item as before'
);
select throws_ok($$select public.undo_refund_import('a4000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'and only once');

-- As the inbound webhook (service role, no signed-in user)
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select lives_ok($$
  select public.auto_apply_refund_import('a4000000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000001',
    array['1e000000-0000-0000-0000-000000000001']::uuid[], 'returned', 220, null, 'aaaaaaaa-0000-0000-0000-000000000001')
$$, 'the webhook applies it for the email''s owner');
reset role;
select is((select status::text from public.items where id = '1e000000-0000-0000-0000-000000000001'), 'returned', 'for that account');

select * from finish();
rollback;
