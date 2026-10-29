-- A refund, return or cancellation notice dates the return by the email (the
-- date in its text, or when it was sent), not by when it was applied.

drop function if exists public.apply_refund_import(uuid, uuid, uuid[], text, numeric);

create or replace function public.apply_refund_import(
  import_id uuid,
  order_id uuid,
  item_ids uuid[],
  outcome text,
  refund numeric,
  happened_on date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  already numeric;
  -- Midday in India, so the day reads the same in any time zone the app uses.
  happened timestamptz := (happened_on + time '12:00') at time zone 'Asia/Kolkata';
begin
  if coalesce(cardinality(item_ids), 0) > 0 then
    perform public.record_purchase_outcome(order_id, item_ids, outcome, refund);
  else
    -- Money back without an item going back (a price drop, a missing part).
    if refund is null or refund < 0 then
      raise exception 'Refund must be zero or more' using errcode = '22023';
    end if;
    select o.refunded_amount into already from public.orders o where o.id = apply_refund_import.order_id;
    if not found then
      raise exception 'Order not found' using errcode = 'P0002';
    end if;
    perform public.set_order_refund(order_id, coalesce(already, 0) + refund);
  end if;

  if happened is not null then
    update public.items i set status_changed_at = happened
    where i.order_id = apply_refund_import.order_id and i.id = any(item_ids);
    if refund > 0 then
      update public.orders o set refunded_at = happened where o.id = apply_refund_import.order_id;
    end if;
  end if;

  perform public.link_import_documents(import_id, order_id => order_id);
  update public.documents d set kind = 'refund_notice'
  where d.import_id = apply_refund_import.import_id and d.kind = 'other';
  perform public.mark_import_saved(
    import_id,
    jsonb_build_object('order_id', order_id, 'refund', refund, 'refunded_item_ids', to_jsonb(coalesce(item_ids, '{}')))
  );
end;
$$;

revoke execute on function public.apply_refund_import(uuid, uuid, uuid[], text, numeric, date) from public, anon;
grant execute on function public.apply_refund_import(uuid, uuid, uuid[], text, numeric, date) to authenticated;
