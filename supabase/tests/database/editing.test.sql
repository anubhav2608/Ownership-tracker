-- Editing and deleting records.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

insert into public.orders (id, merchant, order_date, total, source)
values ('a0000000-0000-0000-0000-00000000000a', 'Croma', '2026-10-01', 42000, 'manual');
insert into public.items (id, order_id, name, category, purchase_date, price, field_meta)
values ('a1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a',
        'Fridge', 'appliances', '2026-10-01', 42000, '{"price": {"state": "extracted", "confidence": 0.6}}');
insert into public.service_events (id, item_id, service_date, work_performed, total_cost)
values ('a3000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
        '2026-10-20', 'Gas refill', 1800);
insert into public.service_event_parts (service_event_id, name, position)
values ('a3000000-0000-0000-0000-00000000000a', 'Old part', 0);

-- ── Service events ───────────────────────────────────────────────────────
select lives_ok($$
  select public.update_service_event('a3000000-0000-0000-0000-00000000000a', '{
    "service_date": "2026-10-21", "work_performed": "Gas refill and filter", "provider": "Urban Company",
    "total_cost": 2100, "labour_cost": 600,
    "parts": [{"name": "Refrigerant", "cost": 1200}, {"name": "Filter drier", "cost": 300}]}')
$$, 'a user can edit their service event');
select is(
  (select work_performed || ' ' || total_cost from public.service_events where id = 'a3000000-0000-0000-0000-00000000000a'),
  'Gas refill and filter 2100.00', 'the event''s fields are updated'
);
select is(
  (select string_agg(name, ', ' order by position) from public.service_event_parts
   where service_event_id = 'a3000000-0000-0000-0000-00000000000a'),
  'Refrigerant, Filter drier', 'the parts list is replaced, in order'
);

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$
  select public.update_service_event('a3000000-0000-0000-0000-00000000000a', '{
    "service_date": "2026-10-21", "work_performed": "Hacked", "total_cost": 0, "parts": []}')
$$, 'P0002', null, 'another user can''t edit the event');
select is_empty($$
  delete from public.service_events where id = 'a3000000-0000-0000-0000-00000000000a' returning 1
$$, 'another user can''t delete the event');
select is_empty($$
  update public.warranties set months = 1 returning 1
$$, 'another user can''t change warranties');

-- ── Items, warranties, purchases ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  update public.items set name = 'Refrigerator', price = 41000, field_meta = '{}'
  where id = 'a1000000-0000-0000-0000-00000000000a'
$$, 'a user can edit their item');
select lives_ok($$
  insert into public.warranties (item_id, months, starts_on, expires_on, provider, state)
  values ('a1000000-0000-0000-0000-00000000000a', 12, '2026-10-01', '2027-10-01', 'LG', 'confirmed')
  on conflict (item_id) do update set months = excluded.months
$$, 'a user can add a warranty they enter themselves');

select lives_ok($$
  delete from public.service_events where id = 'a3000000-0000-0000-0000-00000000000a'
$$, 'a user can delete their service event');
select is_empty($$
  select 1 from public.service_event_parts where service_event_id = 'a3000000-0000-0000-0000-00000000000a'
$$, 'deleting an event removes its parts');

delete from public.orders where id = 'a0000000-0000-0000-0000-00000000000a';
select is_empty($$
  select 1 from public.warranties where item_id = 'a1000000-0000-0000-0000-00000000000a'
$$, 'deleting a purchase removes its items and their warranties');

select * from finish();
rollback;
