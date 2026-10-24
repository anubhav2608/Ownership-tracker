-- Personal keys for the Gmail script.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);

select lives_ok($$ select public.set_inbound_key(repeat('a', 64), '…a1b2') $$, 'a user can set their key');
select is((select inbound_key_hint from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'), '…a1b2',
  'only a hint of the key is kept for display');
select throws_ok($$ select public.set_inbound_key('not-a-hash', 'x') $$, '22023', null, 'only a SHA-256 hash is accepted');
select throws_ok($$ update public.profiles set inbound_key_hash = repeat('b', 64) $$, '42501', null,
  'the key can''t be written directly');

select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}', true);
select throws_ok($$ select public.set_inbound_key(repeat('a', 64), 'x') $$, '23505', null,
  'two users can''t share a key');

select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}', true);
select public.set_inbound_key(null, null);
select is((select inbound_key_hash from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'), null,
  'revoking removes the key');

select * from finish();
rollback;
