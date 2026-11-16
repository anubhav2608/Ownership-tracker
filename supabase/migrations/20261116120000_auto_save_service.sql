-- A service invoice read with high accuracy, and matched to one of the user's
-- cars beyond doubt, is saved without waiting for review. Delete the import
-- "with what was saved from it" to undo. The inbound-email webhook saves it for
-- the account it arrived for (`owner`); a signed-in user only for their own.
--   event: the same object create_manual_service_event takes (no import_id).
-- Returns {service_event_id}.

create or replace function public.auto_save_service_import(import_id uuid, event jsonb, owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  made jsonb;
begin
  if uid is not null and owner is not null and owner <> uid then
    raise exception 'Not your import' using errcode = '42501';
  end if;
  uid := coalesce(uid, owner);
  if uid is null then
    raise exception 'No account' using errcode = '42501';
  end if;
  -- The service role has no user of its own: act as the import's owner from here on.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid)::text, true);

  if not exists (
    select 1 from public.imports i
    where i.id = auto_save_service_import.import_id and i.user_id = uid and i.status = 'needs_review'
  ) then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;

  made := public.create_manual_service_event(
    (event - 'import_id') || jsonb_build_object('import_id', auto_save_service_import.import_id)
  );
  update public.imports i set result = i.result || '{"auto": true}'::jsonb
  where i.id = auto_save_service_import.import_id and i.user_id = uid;
  return made;
end;
$$;

revoke execute on function public.auto_save_service_import(uuid, jsonb, uuid) from public, anon;
grant execute on function public.auto_save_service_import(uuid, jsonb, uuid) to authenticated, service_role;
