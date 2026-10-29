-- When an item was returned (or its status otherwise changed) and when money
-- last came back on an order, so returns can be listed by when they happened.

alter table public.items add column status_changed_at timestamptz;
alter table public.orders add column refunded_at timestamptz;

-- Returns recorded before this: the last update is the best date there is.
update public.items set status_changed_at = updated_at where status <> 'owned';
update public.orders set refunded_at = updated_at where refunded_amount is not null;

create function public.stamp_item_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger items_status_changed
  before update of status on public.items
  for each row execute function public.stamp_item_status();

create function public.stamp_order_refund()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.refunded_amount, 0) is distinct from coalesce(old.refunded_amount, 0) then
    new.refunded_at := case when coalesce(new.refunded_amount, 0) = 0 then null else now() end;
  end if;
  return new;
end;
$$;

create trigger orders_refund_changed
  before update of refunded_amount on public.orders
  for each row execute function public.stamp_order_refund();
