-- Forwarded emails (spec §4A). The inbound webhook (server, service role)
-- stores each message and its attachments as documents and creates the import;
-- reading then works the same as for uploads.

-- Resend retries a webhook delivery with the same id; it must not create a
-- second import.
alter table public.imports add column inbound_event_id text;
create unique index imports_inbound_event_id_key
  on public.imports (inbound_event_id)
  where inbound_event_id is not null;

-- A read that crashed leaves the import "processing". After a few minutes the
-- owner may start it again.
create or replace function public.start_import_processing(import_id uuid)
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
    and (
      i.status in ('queued', 'failed')
      or (i.status = 'processing' and i.updated_at < now() - interval '5 minutes')
    );
  return found;
end;
$$;

-- Mail from an address the user hasn't verified is held unread. Seeing it in
-- their own account, the user can trust the sender: it becomes verified and
-- the held import is queued to be read.
create function public.approve_import_sender(import_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  sender text;
begin
  select lower(i.from_email) into sender
  from public.imports i
  where i.id = approve_import_sender.import_id
    and i.user_id = uid
    and i.source = 'email'
    and i.status = 'failed'
    and i.error ->> 'code' = 'SENDER_NOT_VERIFIED'
    and i.from_email is not null;

  if sender is null then
    raise exception 'Import not found or not held for its sender' using errcode = 'P0002';
  end if;

  insert into public.verified_senders (user_id, email, verified_at)
  values (uid, sender, now())
  on conflict (user_id, email) do update
    set verified_at = coalesce(public.verified_senders.verified_at, now());

  -- Every message held for this sender can be read now.
  update public.imports i
  set status = 'queued', error = null
  where i.user_id = uid
    and i.status = 'failed'
    and i.error ->> 'code' = 'SENDER_NOT_VERIFIED'
    and lower(i.from_email) = sender;

  return sender;
end;
$$;

revoke execute on function public.approve_import_sender(uuid) from public, anon;
grant execute on function public.approve_import_sender(uuid) to authenticated;

-- Purchases saved from a forwarded email are marked as coming from email.
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
