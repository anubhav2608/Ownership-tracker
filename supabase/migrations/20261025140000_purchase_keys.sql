-- The order number and the invoice number each identify a purchase: a user
-- can't have two purchases with the same one. Saving a purchase that already
-- exists asks the user, who can replace the old one.

alter table public.orders add column invoice_ref text;

-- Enforced in the database too, unless earlier data already has duplicates (the
-- app still refuses new ones; merging old duplicates is left to the user).
do $$
begin
  if not exists (
    select 1 from public.orders where order_ref is not null
    group by user_id, lower(order_ref) having count(*) > 1
  ) then
    create unique index orders_order_ref_key on public.orders (user_id, lower(order_ref))
      where order_ref is not null;
  else
    raise notice 'orders.order_ref has duplicates; unique index not created';
  end if;
  create unique index orders_invoice_ref_key on public.orders (user_id, lower(invoice_ref))
    where invoice_ref is not null;
end;
$$;

--   purchase: as before, plus invoice_ref? and replace_order_id? (the purchase
--   the user agreed to replace).
create or replace function public.create_manual_purchase(purchase jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_order_id uuid;
  new_item_id uuid;
  new_item_ids uuid[] := '{}';
  from_import uuid := nullif(purchase ->> 'import_id', '')::uuid;
  order_date date := (purchase ->> 'order_date')::date;
  currency char(3) := coalesce(nullif(purchase ->> 'currency', ''), 'INR');
  source_document uuid;
  new_order_ref text := nullif(trim(purchase ->> 'order_ref'), '');
  new_invoice_ref text := nullif(trim(purchase ->> 'invoice_ref'), '');
  replace_id uuid := nullif(purchase ->> 'replace_order_id', '')::uuid;
  existing record;
  item jsonb;
  warranty jsonb;
  result jsonb;
begin
  if jsonb_typeof(purchase -> 'items') <> 'array' or jsonb_array_length(purchase -> 'items') = 0 then
    raise exception 'A purchase needs at least one item' using errcode = '22023';
  end if;

  -- The order and invoice numbers identify a purchase. Saving one that exists
  -- is refused unless the caller asks to replace that purchase.
  for existing in
    select o.id, o.import_id from public.orders o
    where o.user_id = (select auth.uid())
      and (
        (new_order_ref is not null and lower(o.order_ref) = lower(new_order_ref))
        or (new_invoice_ref is not null and lower(o.invoice_ref) = lower(new_invoice_ref))
      )
  loop
    if existing.id is distinct from replace_id then
      raise exception 'A purchase with this order or invoice number already exists'
        using errcode = 'OT409', detail = existing.id::text;
    end if;
    -- Replacing: the old purchase goes with its items, warranties and service
    -- history (cascades), and so does the import it came from.
    delete from public.orders o where o.id = existing.id;
    if existing.import_id is not null and existing.import_id is distinct from from_import then
      delete from public.imports i where i.id = existing.import_id;
    end if;
  end loop;

  if from_import is not null then
    select d.id into source_document
    from public.documents d where d.import_id = from_import
    order by d.created_at limit 1;
  end if;

  insert into public.orders (merchant, order_ref, invoice_ref, order_date, total, currency, source, import_id, field_meta)
  values (
    purchase ->> 'merchant',
    new_order_ref,
    new_invoice_ref,
    order_date,
    coalesce(
      nullif(purchase ->> 'total', '')::numeric,
      (
        select sum((i ->> 'price')::numeric)
        from jsonb_array_elements(purchase -> 'items') i
        where nullif(i ->> 'price', '') is not null
      )
    ),
    currency,
    coalesce(
      (select i.source from public.imports i where i.id = from_import),
      'manual'
    )::public.record_source,
    from_import,
    coalesce(purchase -> 'field_meta', '{}')
  )
  returning id into new_order_id;

  for item in select value from jsonb_array_elements(purchase -> 'items') with ordinality order by ordinality loop
    insert into public.items (order_id, name, brand, model, category, purchase_date, price, currency, field_meta)
    values (
      new_order_id,
      item ->> 'name',
      nullif(item ->> 'brand', ''),
      nullif(item ->> 'model', ''),
      (item ->> 'category')::public.item_category,
      order_date,
      nullif(item ->> 'price', '')::numeric,
      currency,
      coalesce(item -> 'field_meta', '{}')
    )
    returning id into new_item_id;
    new_item_ids := new_item_ids || new_item_id;

    warranty := item -> 'warranty';
    if jsonb_typeof(warranty) = 'object' and nullif(warranty ->> 'months', '') is not null then
      insert into public.warranties (item_id, months, starts_on, expires_on, state, evidence, document_id)
      values (
        new_item_id,
        (warranty ->> 'months')::integer,
        order_date,
        (order_date + make_interval(months => (warranty ->> 'months')::integer))::date,
        coalesce(nullif(warranty ->> 'state', ''), 'confirmed')::public.field_state,
        nullif(warranty ->> 'evidence', ''),
        source_document
      );
    end if;
  end loop;

  result := jsonb_build_object('order_id', new_order_id, 'item_ids', to_jsonb(new_item_ids));

  if from_import is not null then
    perform public.link_import_documents(from_import, new_order_id, new_item_ids);
    update public.documents d set kind = 'invoice'
    where d.import_id = from_import and d.kind = 'other';
    perform public.mark_import_saved(from_import, result);
  end if;

  return result;
end;
$$;
