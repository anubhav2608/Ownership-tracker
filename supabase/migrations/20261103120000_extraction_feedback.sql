-- What the user changed when saving an import: one row per field compared,
-- so the reader's accuracy can be measured on real mail (Settings shows it).
-- Values are the user's own data, under the same rules as the rest of it.

create table if not exists public.extraction_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id uuid,
  shop text,
  parser text,
  document_kind text,
  -- "merchant", "date", "total", "item.name", "item.price", "item" (removed or added), "refund.items", …
  field text not null check (length(field) between 1 and 40),
  extracted text check (length(extracted) <= 500),
  saved text check (length(saved) <= 500),
  changed boolean not null,
  created_at timestamptz not null default now(),
  foreign key (import_id) references public.imports (id) on delete set null
);

create index if not exists extraction_feedback_user_idx on public.extraction_feedback (user_id, created_at desc);

alter table public.extraction_feedback enable row level security;

drop policy if exists "Own feedback: read" on public.extraction_feedback;
create policy "Own feedback: read"
  on public.extraction_feedback for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Own feedback: add" on public.extraction_feedback;
create policy "Own feedback: add"
  on public.extraction_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.extraction_feedback from anon;
revoke update, delete on public.extraction_feedback from authenticated;
