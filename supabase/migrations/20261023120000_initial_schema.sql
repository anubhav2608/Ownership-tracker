-- Ownership Tracker: initial schema.
--
-- Every user-owned row carries user_id and is protected by row level security.
-- Rows that reference other rows use composite (id, user_id) foreign keys, so a
-- user can never link their record to someone else's, even with a guessed id
-- (foreign key checks are not subject to RLS).

-- Trigram index for item search.
create extension if not exists pg_trgm with schema extensions;

-- ── Types ─────────────────────────────────────────────────────────────────

create type public.record_source as enum ('email', 'upload', 'manual');

-- Where a stored value came from. A null value with state 'missing' means the
-- source didn't contain it.
create type public.field_state as enum ('missing', 'extracted', 'confirmed');

create type public.order_status as enum ('completed', 'refunded', 'partially_refunded');

create type public.item_status as enum ('owned', 'returned', 'sold', 'disposed');

create type public.item_category as enum (
  'electronics', 'appliances', 'vehicle', 'furniture', 'accessories', 'home'
);

create type public.document_kind as enum (
  'order_confirmation', 'invoice', 'refund_notice', 'service_receipt', 'warranty_card', 'other'
);

create type public.import_status as enum (
  'queued', 'processing', 'needs_review', 'imported', 'duplicate', 'unsupported', 'failed'
);

create type public.import_stage as enum (
  'received', 'verified', 'text_extracted', 'parsed', 'validated', 'matched', 'saved'
);

-- ── Helpers ───────────────────────────────────────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- field_meta maps a column name to {"state": field_state, "confidence": 0..1}.
-- Columns absent from the map were entered or confirmed by the user.
create function public.is_valid_field_meta(meta jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(meta) = 'object'
    and not exists (
      select 1
      from jsonb_each(meta) as m(key, value)
      where jsonb_typeof(m.value) <> 'object'
        or (m.value ->> 'state') is null
        or (m.value ->> 'state') not in ('missing', 'extracted', 'confirmed')
        or (
          m.value ? 'confidence'
          and (
            jsonb_typeof(m.value -> 'confidence') <> 'number'
            or (m.value ->> 'confidence')::numeric not between 0 and 1
          )
        )
    );
$$;

-- ── Profiles and forwarding ──────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Local part of the user's inbound address, e.g. u_3f9c...@in.example.com.
  -- 64 random bits; regenerate to revoke an address that leaked.
  forwarding_token text not null unique
    default 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Addresses allowed to forward mail into an account. Users add addresses;
-- only the server marks them verified (after a confirmation email).
create table public.verified_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create index verified_senders_email_idx on public.verified_senders (email);

-- ── Imports (forwarded emails and uploads moving through the pipeline) ───

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source public.record_source not null check (source <> 'manual'),
  status public.import_status not null default 'queued',
  stage public.import_stage not null default 'received',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  received_at timestamptz not null default now(),
  -- Email subject, or the file name for uploads.
  title text not null,
  from_email text,
  -- RFC 5322 Message-ID for emails; used to detect re-forwarded messages.
  message_id text,
  -- SHA-256 of the raw message or file; catches duplicates without a Message-ID.
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  raw_storage_path text,
  document_kind public.document_kind,
  -- Deterministic template name (e.g. "amazon-in/order-confirmation@v3") or "llm".
  parser text,
  review_reasons text[] not null default '{}',
  -- {"code", "message", "stage", "retryable"} when status = 'failed'.
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  duplicate_of uuid,
  -- Extracted fields, line items and parts, as shown on the review screen.
  extracted jsonb not null default '{}' check (jsonb_typeof(extracted) = 'object'),
  -- Item match candidates: [{"item_id", "score", "evidence": [...]}].
  candidates jsonb not null default '[]' check (jsonb_typeof(candidates) = 'array'),
  -- Records created on save: {"order_id", "item_ids", "service_event_id"}.
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (duplicate_of, user_id)
    references public.imports (id, user_id) on delete set null (duplicate_of),
  check (status <> 'duplicate' or duplicate_of is not null),
  check (status <> 'failed' or error is not null)
);

create index imports_user_status_idx on public.imports (user_id, status, received_at desc);
create unique index imports_message_id_key
  on public.imports (user_id, message_id)
  where message_id is not null and duplicate_of is null;
create unique index imports_content_sha256_key
  on public.imports (user_id, content_sha256)
  where content_sha256 is not null and duplicate_of is null;
create index imports_retry_idx
  on public.imports (next_attempt_at)
  where status = 'queued';

create trigger imports_updated_at
  before update on public.imports
  for each row execute function public.set_updated_at();

-- ── Documents ─────────────────────────────────────────────────────────────

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.document_kind not null default 'other',
  file_name text not null,
  -- Path in the private "documents" bucket: <user_id>/<uuid>.<ext>
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  source public.record_source not null,
  import_id uuid,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, sha256),
  check (split_part(storage_path, '/', 1) = user_id::text),
  foreign key (import_id, user_id)
    references public.imports (id, user_id) on delete set null (import_id)
);

-- ── Orders (purchases) ───────────────────────────────────────────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant text not null check (length(trim(merchant)) > 0),
  order_ref text,
  order_date date,
  total numeric(12, 2) check (total >= 0),
  currency char(3) not null default 'INR',
  status public.order_status not null default 'completed',
  refunded_amount numeric(12, 2) check (refunded_amount >= 0),
  source public.record_source not null,
  import_id uuid,
  field_meta jsonb not null default '{}' check (public.is_valid_field_meta(field_meta)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (import_id, user_id)
    references public.imports (id, user_id) on delete set null (import_id),
  check (status = 'completed' or refunded_amount is not null)
);

create index orders_user_date_idx on public.orders (user_id, order_date desc);
create index orders_user_merchant_idx on public.orders (user_id, lower(merchant));
create index orders_user_ref_idx on public.orders (user_id, order_ref) where order_ref is not null;

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ── Items (physical things owned) ────────────────────────────────────────

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Deleting a purchase deletes its items (the UI warns about this).
  order_id uuid,
  name text not null check (length(trim(name)) > 0),
  brand text,
  model text,
  category public.item_category not null,
  status public.item_status not null default 'owned',
  purchase_date date,
  price numeric(12, 2) check (price >= 0),
  currency char(3) not null default 'INR',
  -- [{"label": "Serial no.", "value": "..."}, {"label": "Registration", ...}]
  identifiers jsonb not null default '[]' check (jsonb_typeof(identifiers) = 'array'),
  notes text,
  field_meta jsonb not null default '{}' check (public.is_valid_field_meta(field_meta)),
  -- Lower-cased text for search across name, brand, model and identifier values.
  search_text text generated always as (
    lower(
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' '
      || coalesce(jsonb_path_query_array(identifiers, '$[*].value')::text, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (order_id, user_id)
    references public.orders (id, user_id) on delete cascade
);

create index items_user_status_idx on public.items (user_id, status, purchase_date desc);
create index items_order_idx on public.items (order_id);
create index items_search_idx on public.items using gin (search_text extensions.gin_trgm_ops);

create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- A warranty is stored only when a source supports it (or the user enters it).
create table public.warranties (
  item_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  months integer not null check (months > 0 and months <= 600),
  starts_on date not null,
  expires_on date not null,
  provider text,
  state public.field_state not null check (state <> 'missing'),
  -- What in the source supports it, e.g. 'Invoice: "1 year limited warranty"'.
  evidence text,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on > starts_on),
  check (state = 'confirmed' or evidence is not null),
  foreign key (item_id, user_id)
    references public.items (id, user_id) on delete cascade,
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete set null (document_id)
);

create index warranties_user_expiry_idx on public.warranties (user_id, expires_on);

create trigger warranties_updated_at
  before update on public.warranties
  for each row execute function public.set_updated_at();

-- ── Service events ───────────────────────────────────────────────────────

create table public.service_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null,
  service_date date not null,
  provider text,
  work_performed text not null check (length(trim(work_performed)) > 0),
  labour_cost numeric(12, 2) check (labour_cost >= 0),
  -- Stored, not derived: receipts include taxes and fees beyond parts + labour.
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  currency char(3) not null default 'INR',
  odometer_km integer check (odometer_km >= 0),
  notes text,
  document_id uuid,
  import_id uuid,
  field_meta jsonb not null default '{}' check (public.is_valid_field_meta(field_meta)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id)
    references public.items (id, user_id) on delete cascade,
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete set null (document_id),
  foreign key (import_id, user_id)
    references public.imports (id, user_id) on delete set null (import_id)
);

create index service_events_item_date_idx on public.service_events (item_id, service_date desc);
create index service_events_user_date_idx on public.service_events (user_id, service_date desc);

create trigger service_events_updated_at
  before update on public.service_events
  for each row execute function public.set_updated_at();

create table public.service_event_parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service_event_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  cost numeric(12, 2) check (cost >= 0),
  position smallint not null default 0,
  foreign key (service_event_id, user_id)
    references public.service_events (id, user_id) on delete cascade
);

create index service_event_parts_event_idx
  on public.service_event_parts (service_event_id, position);

-- ── Document links (a document can belong to an order, item or service) ──

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  order_id uuid,
  item_id uuid,
  service_event_id uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(order_id, item_id, service_event_id) = 1),
  unique nulls not distinct (document_id, order_id, item_id, service_event_id),
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade,
  foreign key (order_id, user_id)
    references public.orders (id, user_id) on delete cascade,
  foreign key (item_id, user_id)
    references public.items (id, user_id) on delete cascade,
  foreign key (service_event_id, user_id)
    references public.service_events (id, user_id) on delete cascade
);

create index document_links_order_idx on public.document_links (order_id) where order_id is not null;
create index document_links_item_idx on public.document_links (item_id) where item_id is not null;
create index document_links_event_idx
  on public.document_links (service_event_id) where service_event_id is not null;

-- ── Row level security ───────────────────────────────────────────────────
-- (select auth.uid()) is evaluated once per statement instead of per row.

alter table public.profiles enable row level security;
alter table public.verified_senders enable row level security;
alter table public.imports enable row level security;
alter table public.documents enable row level security;
alter table public.orders enable row level security;
alter table public.items enable row level security;
alter table public.warranties enable row level security;
alter table public.service_events enable row level security;
alter table public.service_event_parts enable row level security;
alter table public.document_links enable row level security;

-- Nothing is readable without signing in, including tables added later.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

create policy "Users read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- Profiles are created by the signup trigger; users can only rename themselves.
revoke insert, delete, update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Users read their senders"
  on public.verified_senders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add unverified senders"
  on public.verified_senders for insert to authenticated
  with check ((select auth.uid()) = user_id and verified_at is null);
create policy "Users remove their senders"
  on public.verified_senders for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke update on public.verified_senders from authenticated;

-- Imports are written by the pipeline (service role). Users can see and delete
-- them, and create upload imports; retries go through retry_import().
create policy "Users read their imports"
  on public.imports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users queue uploads"
  on public.imports for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and source = 'upload' and status = 'queued' and stage = 'received' and attempts = 0
  );
create policy "Users delete their imports"
  on public.imports for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke update on public.imports from authenticated;

-- Records the user owns outright: full access to their own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'orders', 'items', 'warranties',
    'service_events', 'service_event_parts', 'document_links'
  ] loop
    execute format(
      'create policy "Users manage their %1$s" on public.%1$I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;

-- ── Signup: profile + the signup email as a verified sender ──────────────

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );

  if new.email is not null then
    insert into public.verified_senders (user_id, email, verified_at)
    values (new.id, lower(new.email), now());
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RPCs ──────────────────────────────────────────────────────────────────

-- Re-queue a failed import the pipeline marked as retryable.
create function public.retry_import(import_id uuid)
returns public.imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.imports;
begin
  update public.imports i
  set status = 'queued',
      error = null,
      next_attempt_at = now()
  where i.id = retry_import.import_id
    and i.user_id = (select auth.uid())
    and i.status = 'failed'
    and coalesce((i.error ->> 'retryable')::boolean, false)
  returning * into result;

  if result.id is null then
    raise exception 'Import not found or not retryable' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke execute on function public.retry_import(uuid) from public, anon;
grant execute on function public.retry_import(uuid) to authenticated;

-- Give the user a new forwarding address; the old one stops accepting mail.
create function public.regenerate_forwarding_token()
returns text
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set forwarding_token = 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
  where id = (select auth.uid())
  returning forwarding_token;
$$;

revoke execute on function public.regenerate_forwarding_token() from public, anon;
grant execute on function public.regenerate_forwarding_token() to authenticated;
