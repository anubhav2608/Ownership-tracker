-- A refund notice matched beyond doubt (by order number, its items named, the
-- amount stated) is applied without waiting for review, and can be undone.
-- The inbound-email webhook applies it for the account it arrived for
-- (`owner`); a signed-in user only for their own.

create or replace function public.auto_apply_refund_import(
  import_id uuid,
  order_id uuid,
  item_ids uuid[],
  outcome text,
  refund numeric,
  happened_on date default null,
  owner uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
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

  if not exists (select 1 from public.orders o where o.id = auto_apply_refund_import.order_id and o.user_id = uid)
     or not exists (select 1 from public.imports i where i.id = auto_apply_refund_import.import_id and i.user_id = uid) then
    raise exception 'Order or import not found' using errcode = 'P0002';
  end if;

  perform public.apply_refund_import(import_id, order_id, item_ids, outcome, refund, happened_on);
  update public.imports i set result = i.result || '{"auto": true}'::jsonb
  where i.id = auto_apply_refund_import.import_id and i.user_id = uid;
end;
$$;

-- Puts back what a refund notice changed and returns it to review: its items
-- owned again, its money off the purchase's refund, the notice unfiled.
create or replace function public.undo_refund_import(import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  imp public.imports;
  target uuid;
  back numeric;
begin
  select * into imp from public.imports i
  where i.id = undo_refund_import.import_id and i.user_id = uid and i.status = 'imported' and i.result ? 'refund'
  for update;
  if not found then
    raise exception 'Nothing to undo' using errcode = 'P0002';
  end if;
  target := (imp.result ->> 'order_id')::uuid;
  back := coalesce((imp.result ->> 'refund')::numeric, 0);

  update public.items it set status = 'owned', status_changed_at = null
  where it.user_id = uid and it.order_id = target
    and it.id in (select jsonb_array_elements_text(coalesce(imp.result -> 'refunded_item_ids', '[]'))::uuid);

  update public.orders o
  set refunded_amount = greatest(0, coalesce(o.refunded_amount, 0) - back)
  where o.id = target and o.user_id = uid;
  perform public.refresh_order_status(target);

  delete from public.document_links l
  using public.documents d
  where l.document_id = d.id and d.import_id = imp.id and d.user_id = uid and l.order_id = target;

  update public.imports i set status = 'needs_review', stage = 'matched', result = null
  where i.id = imp.id;
end;
$$;

revoke execute on function public.auto_apply_refund_import(uuid, uuid, uuid[], text, numeric, date, uuid) from public, anon;
grant execute on function public.auto_apply_refund_import(uuid, uuid, uuid[], text, numeric, date, uuid) to authenticated, service_role;
revoke execute on function public.undo_refund_import(uuid) from public, anon;
grant execute on function public.undo_refund_import(uuid) to authenticated;
