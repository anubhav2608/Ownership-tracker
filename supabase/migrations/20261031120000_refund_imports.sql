-- A forwarded refund notice is applied to the purchase it's for, once the user
-- has checked it: the refunded items are marked returned (or cancelled), the
-- money back is added to the order, and the notice is filed with the purchase.

create or replace function public.apply_refund_import(
  import_id uuid,
  order_id uuid,
  item_ids uuid[],
  outcome text,
  refund numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  already numeric;
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

  perform public.link_import_documents(import_id, order_id => order_id);
  update public.documents d set kind = 'refund_notice'
  where d.import_id = apply_refund_import.import_id and d.kind = 'other';
  perform public.mark_import_saved(
    import_id,
    jsonb_build_object('order_id', order_id, 'refund', refund, 'refunded_item_ids', to_jsonb(coalesce(item_ids, '{}')))
  );
end;
$$;

revoke execute on function public.apply_refund_import(uuid, uuid, uuid[], text, numeric) from public, anon;
grant execute on function public.apply_refund_import(uuid, uuid, uuid[], text, numeric) to authenticated;
