-- Sending emails from the user's own Gmail with a Google Apps Script. The
-- script posts each labelled message with a personal key; only a SHA-256 hash
-- of the key is stored, so a leaked database doesn't leak working keys.

alter table public.profiles
  add column inbound_key_hash text unique check (inbound_key_hash ~ '^[0-9a-f]{64}$'),
  add column inbound_key_hint text check (char_length(inbound_key_hint) <= 8),
  add column inbound_key_created_at timestamptz;

-- Emails sent with the user's key come from the user, whoever the original
-- sender (a shop) was, so they're read without a verified-sender check.
alter table public.imports add column sender_trusted boolean not null default false;

-- Sets (or, with nulls, revokes) the caller's key. The app generates the key
-- and shows it once; the database only ever sees its hash.
create function public.set_inbound_key(key_hash text, hint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if key_hash is not null and key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid key hash' using errcode = '22023';
  end if;
  update public.profiles p
  set inbound_key_hash = key_hash,
      inbound_key_hint = case when key_hash is null then null else left(hint, 8) end,
      inbound_key_created_at = case when key_hash is null then null else now() end
  where p.id = (select auth.uid());
end;
$$;

revoke execute on function public.set_inbound_key(text, text) from public, anon;
grant execute on function public.set_inbound_key(text, text) to authenticated;
