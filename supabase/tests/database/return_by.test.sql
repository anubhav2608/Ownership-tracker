-- Return-by dates on items.
begin;
select plan(3);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select lives_ok($$
  select public.create_manual_purchase('{
    "merchant": "Myntra", "order_date": "2026-09-14",
    "items": [{"name": "Hoodie", "category": "clothing", "return_by": "2026-09-28"},
              {"name": "Gift card", "category": "other"}]}')
$$, 'items can be saved with a return-by date');
select is(
  (select array_agg(coalesce(return_by::text, '-') order by name) from public.items),
  array['-', '2026-09-28'], 'each item keeps its own return-by date'
);
select throws_ok($$
  update public.items set return_by = '2026-09-01' where name = 'Hoodie'
$$, '23514', null, 'a return-by date can''t be before the purchase');

select * from finish();
rollback;
