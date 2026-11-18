-- An order confirmation or invoice read accurately (see src/lib/extraction/auto-save.ts),
-- with nothing for the user to resolve, is saved without waiting for review: one
-- purchase per order, exactly as "Confirm and save" would. A purchase already
-- saved with the same order or invoice number is refused (OT409), so that one
-- waits for review. Delete the import "with what was saved from it" to undo.
-- The inbound-email webhook saves it for the account it arrived for (`owner`);
-- a signed-in user only for their own.
--   purchases: the array create_purchases_from_import takes.
-- Returns {order_id, order_ids, item_ids, auto: true}.

create or replace function public.auto_save_purchase_import(import_id uuid, purchases jsonb, owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  made jsonb;
begin
  if uid is not null and owner is not null and owner <> uid then
    raise exception 'Not your import' using errcode = '42501';
  end if;
  uid := coalesce(uid, owner);
  if uid is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  -- The service role has no user of its own: act as the import's owner from here on.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid)::text, true);

  if not exists (
    select 1 from public.imports i
    where i.id = auto_save_purchase_import.import_id and i.user_id = uid and i.status = 'needs_review'
  ) then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;

  made := public.create_purchases_from_import(auto_save_purchase_import.import_id, purchases);
  update public.imports i set result = i.result || '{"auto": true}'::jsonb
  where i.id = auto_save_purchase_import.import_id and i.user_id = uid;
  return made || '{"auto": true}'::jsonb;
end;
$$;

revoke execute on function public.auto_save_purchase_import(uuid, jsonb, uuid) from public, anon;
grant execute on function public.auto_save_purchase_import(uuid, jsonb, uuid) to authenticated, service_role;
