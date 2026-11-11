-- An email confirming several orders is saved as one purchase per order, so a
-- later refund, cancellation or shipping email lines up with its own purchase
-- by order number. All of them in one transaction: one existing order number
-- and nothing is saved.
--   purchases: [{merchant, order_date, order_ref, total, items: [...], field_meta?}, ...]
-- Returns {order_id (the first), order_ids, item_ids}.

create or replace function public.create_purchases_from_import(import_id uuid, purchases jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p jsonb;
  made jsonb;
  new_order uuid;
  new_items uuid[];
  order_ids uuid[] := '{}';
  item_ids uuid[] := '{}';
  from_source public.record_source;
  first_document uuid;
  result jsonb;
begin
  if jsonb_typeof(purchases) <> 'array' or jsonb_array_length(purchases) = 0 then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;
  select i.source into from_source from public.imports i where i.id = create_purchases_from_import.import_id;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  select d.id into first_document from public.documents d
  where d.import_id = create_purchases_from_import.import_id order by d.created_at limit 1;

  for p in select value from jsonb_array_elements(purchases) loop
    -- Made without the import (which would mark it saved after the first), then tied to it.
    made := public.create_manual_purchase(p - 'import_id' - 'replace_order_id');
    new_order := (made ->> 'order_id')::uuid;
    new_items := array(select jsonb_array_elements_text(made -> 'item_ids')::uuid);
    update public.orders o set import_id = create_purchases_from_import.import_id, source = from_source
    where o.id = new_order;
    update public.warranties w set document_id = first_document
    where w.item_id = any(new_items) and w.document_id is null;
    perform public.link_import_documents(create_purchases_from_import.import_id, new_order, new_items);
    order_ids := order_ids || new_order;
    item_ids := item_ids || new_items;
  end loop;

  update public.documents d set kind = 'invoice'
  where d.import_id = create_purchases_from_import.import_id and d.kind = 'other';
  result := jsonb_build_object('order_id', order_ids[1], 'order_ids', to_jsonb(order_ids), 'item_ids', to_jsonb(item_ids));
  perform public.mark_import_saved(create_purchases_from_import.import_id, result);
  return result;
end;
$$;

revoke execute on function public.create_purchases_from_import(uuid, jsonb) from public, anon;
grant execute on function public.create_purchases_from_import(uuid, jsonb) to authenticated;
