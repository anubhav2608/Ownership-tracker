-- Saving purchases and service events entered by hand, optionally from an
-- uploaded document. Each save is one transaction, so a failure can't leave a
-- purchase without its items or links.

-- Marks an import as saved once the user has turned it into records. Users
-- can't update imports directly (see the initial schema), so this checks that
-- the import is theirs and still open, and that the records it points at are
-- theirs too.
create function public.mark_import_saved(import_id uuid, result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if jsonb_typeof(result) <> 'object' then
    raise exception 'result must be an object' using errcode = '22023';
  end if;

  if result ? 'order_id' and not exists (
    select 1 from public.orders o where o.id = (result ->> 'order_id')::uuid and o.user_id = uid
  ) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if result ? 'service_event_id' and not exists (
    select 1 from public.service_events e
    where e.id = (result ->> 'service_event_id')::uuid and e.user_id = uid
  ) then
    raise exception 'Service event not found' using errcode = 'P0002';
  end if;

  update public.imports i
  set status = 'imported',
      stage = 'saved',
      error = null,
      result = mark_import_saved.result
  where i.id = mark_import_saved.import_id
    and i.user_id = uid
    and i.status in ('queued', 'needs_review', 'failed', 'unsupported');

  if not found then
    raise exception 'Import not found or already saved' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.mark_import_saved(uuid, jsonb) from public, anon;
grant execute on function public.mark_import_saved(uuid, jsonb) to authenticated;

-- Attaches every document from an import to the given order / item / event.
create function public.link_import_documents(
  import_id uuid,
  order_id uuid default null,
  item_ids uuid[] default '{}',
  service_event_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.document_links (document_id, order_id, item_id, service_event_id)
  select d.id, t.order_id, t.item_id, t.service_event_id
  from public.documents d
  cross join lateral (
    select link_import_documents.order_id as order_id, null::uuid as item_id, null::uuid as service_event_id
    where link_import_documents.order_id is not null
    union all
    select null, unnest(link_import_documents.item_ids), null
    union all
    select null, null, link_import_documents.service_event_id
    where link_import_documents.service_event_id is not null
  ) t
  where d.import_id = link_import_documents.import_id
  on conflict do nothing;
$$;

-- Creates a purchase and its items. Runs as the caller, so row level security
-- applies to every insert.
--   purchase: {merchant, order_date, order_ref?, currency?, import_id?,
--              items: [{name, category, price?, brand?, model?}]}
-- Returns {order_id, item_ids}.
create function public.create_manual_purchase(purchase jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_order_id uuid;
  new_item_ids uuid[];
  from_import uuid := nullif(purchase ->> 'import_id', '')::uuid;
  result jsonb;
begin
  if jsonb_typeof(purchase -> 'items') <> 'array' or jsonb_array_length(purchase -> 'items') = 0 then
    raise exception 'A purchase needs at least one item' using errcode = '22023';
  end if;

  insert into public.orders (merchant, order_ref, order_date, total, currency, source, import_id)
  select
    purchase ->> 'merchant',
    nullif(purchase ->> 'order_ref', ''),
    (purchase ->> 'order_date')::date,
    (
      select sum((i ->> 'price')::numeric)
      from jsonb_array_elements(purchase -> 'items') i
      where nullif(i ->> 'price', '') is not null
    ),
    coalesce(nullif(purchase ->> 'currency', ''), 'INR'),
    case when from_import is null then 'manual' else 'upload' end::public.record_source,
    from_import
  returning id into new_order_id;

  with inserted as (
    insert into public.items (order_id, name, brand, model, category, purchase_date, price, currency)
    select
      new_order_id,
      i ->> 'name',
      nullif(i ->> 'brand', ''),
      nullif(i ->> 'model', ''),
      (i ->> 'category')::public.item_category,
      (purchase ->> 'order_date')::date,
      nullif(i ->> 'price', '')::numeric,
      coalesce(nullif(purchase ->> 'currency', ''), 'INR')
    from jsonb_array_elements(purchase -> 'items') with ordinality as x(i, n)
    order by n
    returning id
  )
  select array_agg(id) into new_item_ids from inserted;

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

revoke execute on function public.create_manual_purchase(jsonb) from public, anon;
grant execute on function public.create_manual_purchase(jsonb) to authenticated;

-- Creates a service event (with its parts) on one of the caller's items.
--   event: {item_id, service_date, work_performed, provider?, total_cost,
--           labour_cost?, odometer_km?, notes?, import_id?,
--           parts: [{name, cost?}]}
-- Returns {service_event_id}.
create function public.create_manual_service_event(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_event_id uuid;
  from_import uuid := nullif(event ->> 'import_id', '')::uuid;
  result jsonb;
begin
  insert into public.service_events (
    item_id, service_date, provider, work_performed, labour_cost, total_cost, odometer_km, notes, import_id
  )
  values (
    (event ->> 'item_id')::uuid,
    (event ->> 'service_date')::date,
    nullif(event ->> 'provider', ''),
    event ->> 'work_performed',
    nullif(event ->> 'labour_cost', '')::numeric,
    coalesce(nullif(event ->> 'total_cost', '')::numeric, 0),
    nullif(event ->> 'odometer_km', '')::integer,
    nullif(event ->> 'notes', ''),
    from_import
  )
  returning id into new_event_id;

  insert into public.service_event_parts (service_event_id, name, cost, position)
  select new_event_id, p ->> 'name', nullif(p ->> 'cost', '')::numeric, (n - 1)::smallint
  from jsonb_array_elements(coalesce(event -> 'parts', '[]')) with ordinality as x(p, n)
  where nullif(trim(p ->> 'name'), '') is not null;

  result := jsonb_build_object('service_event_id', new_event_id);

  if from_import is not null then
    perform public.link_import_documents(from_import, service_event_id => new_event_id);
    update public.documents d set kind = 'service_receipt'
    where d.import_id = from_import and d.kind = 'other';
    perform public.mark_import_saved(from_import, result);
  end if;

  return result;
end;
$$;

revoke execute on function public.create_manual_service_event(jsonb) from public, anon;
grant execute on function public.create_manual_service_event(jsonb) to authenticated;
