-- Returned, cancelled and refunded purchases. An order or some of its items can
-- be returned or cancelled, and money back is recorded on the order, so what
-- was spent is the total less refunds (and nothing for a cancelled order).

alter type public.order_status add value if not exists 'cancelled';
alter type public.item_status add value if not exists 'cancelled';

-- The order's status from its refund and its items: cancelled once every item
-- is, refunded once the refund covers the total, partly refunded below that.
create or replace function public.refresh_order_status(order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o public.orders;
  all_cancelled boolean;
begin
  select * into o from public.orders where id = refresh_order_status.order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select count(*) > 0 and bool_and(i.status = 'cancelled') into all_cancelled
  from public.items i where i.order_id = o.id;

  update public.orders
  set status = case
        when all_cancelled then 'cancelled'
        when coalesce(o.refunded_amount, 0) = 0 then 'completed'
        when o.total is not null and o.refunded_amount >= o.total then 'refunded'
        else 'partially_refunded'
      end::public.order_status,
      -- A status other than completed needs an amount, even if nothing came back.
      refunded_amount = case
        when all_cancelled then coalesce(o.refunded_amount, 0)
        else nullif(o.refunded_amount, 0)
      end
  where id = o.id;
end;
$$;

-- Marks items of an order as returned or cancelled (all of them when item_ids
-- is empty) and adds the money back to the order's refund, up to its total.
create or replace function public.record_purchase_outcome(
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
  o public.orders;
  wanted int := coalesce(cardinality(item_ids), 0);
  matched int;
begin
  if outcome not in ('returned', 'cancelled') then
    raise exception 'Outcome must be returned or cancelled' using errcode = '22023';
  end if;
  if refund is null or refund < 0 then
    raise exception 'Refund must be zero or more' using errcode = '22023';
  end if;

  select * into o from public.orders
  where id = record_purchase_outcome.order_id
  for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if wanted > 0 then
    select count(*) into matched from public.items i
    where i.order_id = o.id and i.id = any(item_ids);
    if matched <> wanted then
      raise exception 'Some items are not in this order' using errcode = '22023';
    end if;
  end if;

  update public.items i
  set status = outcome::public.item_status
  where i.order_id = o.id and (wanted = 0 or i.id = any(item_ids));

  update public.orders
  set refunded_amount = case
        when o.total is null then coalesce(o.refunded_amount, 0) + refund
        else least(o.total, coalesce(o.refunded_amount, 0) + refund)
      end
  where id = o.id;

  perform public.refresh_order_status(o.id);
end;
$$;

-- Corrects the money back on an order (the refund came in lower, or later).
create or replace function public.set_order_refund(order_id uuid, amount numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if amount is null or amount < 0 then
    raise exception 'Refund must be zero or more' using errcode = '22023';
  end if;

  update public.orders o
  set refunded_amount = case when o.total is null then amount else least(o.total, amount) end
  where o.id = set_order_refund.order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform public.refresh_order_status(set_order_refund.order_id);
end;
$$;

revoke execute on function public.refresh_order_status(uuid) from public, anon;
revoke execute on function public.record_purchase_outcome(uuid, uuid[], text, numeric) from public, anon;
revoke execute on function public.set_order_refund(uuid, numeric) from public, anon;
grant execute on function public.refresh_order_status(uuid) to authenticated;
grant execute on function public.record_purchase_outcome(uuid, uuid[], text, numeric) to authenticated;
grant execute on function public.set_order_refund(uuid, numeric) to authenticated;
