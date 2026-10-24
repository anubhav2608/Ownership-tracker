-- Editing a service event replaces its fields and its list of parts in one
-- transaction. Runs as the caller, so row level security applies.
--   event: {service_date, work_performed, provider?, total_cost, labour_cost?,
--           odometer_km?, notes?, parts: [{name, cost?}]}
create function public.update_service_event(event_id uuid, event jsonb)
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

  insert into public.service_event_parts (service_event_id, name, cost, position)
  select update_service_event.event_id, trim(p ->> 'name'), nullif(p ->> 'cost', '')::numeric, (n - 1)::smallint
  from jsonb_array_elements(coalesce(event -> 'parts', '[]')) with ordinality as x(p, n)
  where nullif(trim(p ->> 'name'), '') is not null;
end;
$$;

revoke execute on function public.update_service_event(uuid, jsonb) from public, anon;
grant execute on function public.update_service_event(uuid, jsonb) to authenticated;
