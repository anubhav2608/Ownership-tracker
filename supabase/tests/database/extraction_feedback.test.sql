-- Corrections recorded when saving an import: each user's own.
begin;
select plan(4);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$
  insert into public.extraction_feedback (shop, field, extracted, saved, changed)
  values ('Example', 'total', '1000', '100', true), ('Example', 'date', '2026-10-24', '2026-10-24', false)
$$, 'a user records what they changed');
select throws_ok($$
  insert into public.extraction_feedback (user_id, field, changed)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'total', true)
$$, '42501', null, 'not as someone else');
select throws_ok($$update public.extraction_feedback set changed = false$$, '42501', null, 'and can''t rewrite it');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select is_empty('select 1 from public.extraction_feedback', 'others don''t see it');

select * from finish();
rollback;
