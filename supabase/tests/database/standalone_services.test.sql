-- Services not on an item, with each line's kind.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select lives_ok($$
  create temp table booking on commit drop as
  select public.create_manual_service_event('{
    "service_date": "2026-07-08", "work_performed": "AC service", "provider": "Example Services",
    "labour_cost": 329, "total_cost": 458,
    "parts": [
      {"name": "Service Charges - AC Service and Repair", "cost": 329, "kind": "service"},
      {"name": "Convenience and Platform Fee", "cost": 129, "kind": "fee"}
    ]}') as r
$$, 'a service can be saved without an item');

select is(
  (select item_id from public.service_events where id = ((select r from booking) ->> 'service_event_id')::uuid),
  null::uuid, 'it is on no item'
);
select results_eq(
  $$select name, cost, kind from public.service_event_parts
    where service_event_id = ((select r from booking) ->> 'service_event_id')::uuid order by position$$,
  $$values ('Service Charges - AC Service and Repair'::text, 329.00::numeric, 'service'::text),
           ('Convenience and Platform Fee'::text, 129.00::numeric, 'fee'::text)$$,
  'each line keeps its kind'
);

select lives_ok($$
  select public.update_service_event(((select r from booking) ->> 'service_event_id')::uuid, '{
    "service_date": "2026-07-08", "work_performed": "AC service", "total_cost": 458,
    "parts": [{"name": "Platform fee", "cost": 129, "kind": "fee"}, {"name": "Gas top-up", "cost": 329}]}')
$$, 'editing replaces the lines');
select results_eq(
  $$select name, kind from public.service_event_parts
    where service_event_id = ((select r from booking) ->> 'service_event_id')::uuid order by position$$,
  $$values ('Platform fee'::text, 'fee'::text), ('Gas top-up'::text, 'part'::text)$$,
  'kinds survive an edit; a line without one is a part'
);

-- Bob sees none of it.
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select is_empty('select 1 from public.service_events', 'another user can''t see a service without an item');

select * from finish();
rollback;
