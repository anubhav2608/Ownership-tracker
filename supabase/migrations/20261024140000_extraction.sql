-- Reading uploaded documents: the app extracts text and fields on the server
-- as the signed-in user, then records the outcome on the import. Users can't
-- update imports directly, so these functions allow only the pipeline's own
-- transitions, on the caller's own imports.

-- queued / failed → processing. Returns false if the import isn't in a state
-- that can be (re)processed, so two requests can't process it at once.
create function public.start_import_processing(import_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.imports i
  set status = 'processing', stage = 'received', error = null
  where i.id = start_import_processing.import_id
    and i.user_id = (select auth.uid())
    and i.status in ('queued', 'failed');
  return found;
end;
$$;

revoke execute on function public.start_import_processing(uuid) from public, anon;
grant execute on function public.start_import_processing(uuid) to authenticated;

-- processing → needs_review / failed / unsupported, with what was extracted.
--   outcome: {status, stage, document_kind?, parser?, extracted?, review_reasons?,
--             candidates?, error?}
create function public.record_import_result(import_id uuid, outcome jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_status public.import_status := (outcome ->> 'status')::public.import_status;
  detected_kind public.document_kind := nullif(outcome ->> 'document_kind', '')::public.document_kind;
begin
  if new_status not in ('needs_review', 'failed', 'unsupported') then
    raise exception 'Invalid import result status %', new_status using errcode = '22023';
  end if;

  update public.imports i
  set status = new_status,
      stage = coalesce(nullif(outcome ->> 'stage', '')::public.import_stage, i.stage),
      attempts = i.attempts + 1,
      next_attempt_at = null,
      document_kind = coalesce(detected_kind, i.document_kind),
      parser = nullif(outcome ->> 'parser', ''),
      extracted = coalesce(outcome -> 'extracted', '{}'),
      candidates = coalesce(outcome -> 'candidates', '[]'),
      review_reasons = coalesce(
        array(select jsonb_array_elements_text(outcome -> 'review_reasons')), '{}'
      ),
      error = case when new_status = 'failed' then outcome -> 'error' end
  where i.id = record_import_result.import_id
    and i.user_id = (select auth.uid())
    and i.status = 'processing';

  if not found then
    raise exception 'Import not found or not being processed' using errcode = 'P0002';
  end if;

  if detected_kind is not null and detected_kind <> 'other' then
    update public.documents d set kind = detected_kind
    where d.import_id = record_import_result.import_id and d.kind = 'other';
  end if;
end;
$$;

revoke execute on function public.record_import_result(uuid, jsonb) from public, anon;
grant execute on function public.record_import_result(uuid, jsonb) to authenticated;

-- Saving a purchase now also keeps where values came from (field_meta), an
-- explicit total (which can include shipping), and a warranty per item when
-- the document states one.
--   purchase: {merchant, order_date, order_ref?, currency?, import_id?, total?,
--              field_meta?, items: [{name, category, price?, brand?, model?,
--              field_meta?, warranty?: {months, evidence?, state?}}]}
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
  item jsonb;
  warranty jsonb;
  result jsonb;
begin
  if jsonb_typeof(purchase -> 'items') <> 'array' or jsonb_array_length(purchase -> 'items') = 0 then
    raise exception 'A purchase needs at least one item' using errcode = '22023';
  end if;

  if from_import is not null then
    select d.id into source_document
    from public.documents d where d.import_id = from_import
    order by d.created_at limit 1;
  end if;

  insert into public.orders (merchant, order_ref, order_date, total, currency, source, import_id, field_meta)
  values (
    purchase ->> 'merchant',
    nullif(purchase ->> 'order_ref', ''),
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
    case when from_import is null then 'manual' else 'upload' end::public.record_source,
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
