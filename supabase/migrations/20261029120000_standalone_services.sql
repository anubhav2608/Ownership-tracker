-- Services needn't be on an item the user owns (a home service booking, or an
-- appliance not entered yet), and a bill's lines say what each one is: the
-- work ("service"), a booking or platform fee ("fee"), or a part ("part").

alter table public.service_events alter column item_id drop not null;

alter table public.service_event_parts
  add column kind text not null default 'part' check (kind in ('part', 'service', 'fee'));

-- As before, with item_id optional and each part's kind.
--   event: {item_id?, service_date, work_performed, provider?, total_cost,
--           labour_cost?, odometer_km?, notes?, import_id?,
--           parts: [{name, cost?, kind?}]}
create or replace function public.create_manual_service_event(event jsonb)
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
    nullif(event ->> 'item_id', '')::uuid,
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

  insert into public.service_event_parts (service_event_id, name, cost, kind, position)
  select new_event_id, p ->> 'name', nullif(p ->> 'cost', '')::numeric,
         coalesce(nullif(p ->> 'kind', ''), 'part'), (n - 1)::smallint
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

-- Editing keeps each part's kind.
create or replace function public.update_service_event(event_id uuid, event jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.service_events e
  set service_date = (event ->> 'service_date')::date,
      work_performed = event ->> 'work_performed',
      provider = nullif(event ->> 'provider', ''),
      labour_cost = nullif(event ->> 'labour_cost', '')::numeric,
      total_cost = coalesce(nullif(event ->> 'total_cost', '')::numeric, 0),
      odometer_km = nullif(event ->> 'odometer_km', '')::integer,
      notes = nullif(event ->> 'notes', ''),
      field_meta = '{}'
  where e.id = update_service_event.event_id;

  if not found then
    raise exception 'Service event not found' using errcode = 'P0002';
  end if;

  delete from public.service_event_parts p where p.service_event_id = update_service_event.event_id;

  insert into public.service_event_parts (service_event_id, name, cost, kind, position)
  select update_service_event.event_id, trim(p ->> 'name'), nullif(p ->> 'cost', '')::numeric,
         coalesce(nullif(p ->> 'kind', ''), 'part'), (n - 1)::smallint
  from jsonb_array_elements(coalesce(event -> 'parts', '[]')) with ordinality as x(p, n)
  where nullif(trim(p ->> 'name'), '') is not null;
end;
$$;
