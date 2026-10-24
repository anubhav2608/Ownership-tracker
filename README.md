# Ownership Tracker

One place to find what you bought, retrieve its records, and track what happens to it
while you own it.

Status: signed-in users see their own data from Supabase. Uploaded PDFs are read
automatically (text layer only; scans and photos need OCR, which comes later), checked, and
wait for your review before anything is saved. Purchases and service events can also be
entered by hand. Next: the Resend inbound webhook. Without Supabase settings the app runs as a demo on fictional sample data.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase settings the app runs as an open **demo** on
sample data; "View demo" on the landing page goes straight to the dashboard.

## Supabase

### Connect a hosted project

1. Create a project at supabase.com. In **Project settings → API**, copy the project URL
   and publishable key into `.env.local` (start from `.env.example`).
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Authentication → URL configuration:** set Site URL to your production URL and add
   `http://localhost:3000/**` and your Vercel URLs (e.g. `https://*-<team>.vercel.app/**`)
   to the redirect URLs. Sign-in emails send people back to these.
4. **Authentication → Email templates:** paste `supabase/templates/magic_link.html` into
   "Magic Link" and `confirmation.html` into "Confirm signup". (`npx supabase config push`
   can push `supabase/config.toml`, including templates, instead.)
5. Optional, Google sign-in: create an OAuth client in Google Cloud, then enable Google
   under **Authentication → Sign In / Providers**.
6. On Vercel, set the same `NEXT_PUBLIC_SUPABASE_*` variables for each environment.

### Local stack (needs Docker)

```bash
npm run db:start     # Postgres, Auth, Storage and Studio; prints URL and keys
npm run db:reset     # re-apply migrations
npm run db:test      # pgTAP security tests
```

Extraction, validation and matching have unit tests on fictional documents: `npm test`.

No Docker? `npm run db:test:local` runs the migrations and tests on any Postgres with pgTAP,
using a small stand-in for Supabase's auth and storage schemas (`scripts/db/`).

After changing the schema, regenerate types with `npm run db:types` (linked project).

### What's in the database

| Table | Holds |
| --- | --- |
| `profiles` | Display name and the private forwarding token (created on signup) |
| `verified_senders` | Addresses allowed to forward mail in; signup email is verified automatically |
| `imports` | Every forwarded email / upload: status, stage, attempts, error, extracted fields, match candidates |
| `orders` | Purchases (merchant, ref, date, total, refund state) |
| `items` | Physical items; several per order; searchable by name, brand, model and identifiers |
| `warranties` | One per item, only with evidence from a source (or entered by the user) |
| `service_events`, `service_event_parts` | Service history with parts, labour and total cost |
| `documents`, `document_links` | Stored files and what they belong to (order, item or service event) |

Security model:

- Row level security on every table: users only ever see and change their own rows.
  Signed-out visitors can read nothing.
- Links between records use (id, user_id) foreign keys, so a record can't be attached to
  another user's item even with a known id.
- Users can't verify senders, set their forwarding token, or change import status
  themselves; the server does that. Retrying uses the `retry_import()` function.
- Files live in the private `documents` bucket under `<user_id>/`; storage policies limit
  each user to their own folder. Raw inbound mail goes to `inbound-raw`, which only the
  server can access.
- Manual purchases and service events are saved by `create_manual_purchase()` and
  `create_manual_service_event()`: one transaction each, running under the caller's row
  level security. Saving from an import attaches its documents and marks it imported.
- Editing a service event (`update_service_event()`) replaces its fields and parts in one
  transaction. Deleting a purchase, item or service event also removes the import it came
  from and any stored documents no longer attached to anything.
- `supabase/tests/database/*.test.sql` check all of the above (74 assertions).

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · shadcn/ui (Radix, new-york style)
· Supabase (`@supabase/ssr`) · Zod · lucide icons · sonner toasts.
`components.json` is set up, so `npx shadcn@latest add <name>` works where
`ui.shadcn.com` is reachable.

## Screens

| Route | Spec | What it does |
| --- | --- | --- |
| `/`, `/login`, `/onboarding` | §4A, story 1 | Landing, sign-up/login, private forwarding address |
| `/dashboard` | §4A | Counts, imports needing you, recent purchases and service |
| `/items` | stories 3, 4 | Search (name, brand, merchant, serial, registration), category / merchant / owned-past filters |
| `/items/[id]` | stories 4–6, 8 | Purchase, warranty with its source, documents, service timeline with parts and per-visit cost comparison; add / edit / delete events; change status; delete item |
| `/purchases`, `/purchases/[id]` | §4A | Orders with several items, documents, refund state, link to source import; delete |
| `/imports` | §4B | Every forwarded email and upload, filtered by needs-you / in progress / imported / skipped |
| `/imports/[id]` | §4B, §4C, §4E, story 7–8 | Pipeline stages; review with missing / extracted / confirmed fields; line items; item matching that never pre-picks an ambiguous match; retry failed imports; unverified senders; duplicates; move a wrongly matched service event |
| `/add` | stories 1, 2 | Forward instructions, upload, manual purchase (several items) or service event |
| `/settings` | §4B | Forwarding address, verified senders, export, delete account |

Reminder and notification workflows are out of scope (§8 #21), so there are none.

## Structure

```
src/
  app/
    (app)/              signed-in screens sharing the sidebar / bottom-nav shell
    login/ onboarding/  public screens
  components/
    ui/                 shadcn/ui components (owned source; edit freely)
    badges.tsx          status, warranty, import and field-provenance badges
    layout-bits.tsx     PageHeader, SectionCard, DetailRow
    document-list.tsx   confirm-delete.tsx   copy-button.tsx   app-shell.tsx
  proxy.ts              refreshes the Supabase session; sends signed-out users to /login
  lib/
    supabase/           browser + server clients, proxy helper, generated database types
    types.ts            domain model: Order, Item, StoredDocument, ServiceEvent, ImportRecord
    data.ts             data access: Supabase when configured, otherwise the sample data
    mock-data.ts        fictional sample data for demo mode
    extraction/         PDF text (pdfjs), parsing with merchant templates, validation,
                        service-item matching; tests generate fictional PDFs with pdf-lib
    format.ts           money / date formatting (locale and currency in one place)
    utils.ts            cn()
```

The types mirror the planned tables. Values that can come from extraction use
`Tracked<T>` (`value` + `state: "missing" | "extracted" | "confirmed"` + `confidence`),
so the UI can always say where a value came from.

Theme tokens (shadcn's plus `success`, `warning`, `danger`, `info` and their `-soft`
variants) live in `src/app/globals.css`, with a dark set that follows the system setting.

## Notes

- Cache Components is on (Next 16 default). Request-time data goes through `lib/data.ts`;
  the server Supabase client calls `connection()` before it starts.
- Real today: sign-in, reading your data, uploading / opening / deleting documents,
  reading uploaded PDFs, reviewing and saving what was read (or retrying), manual
  purchases and service events, and editing and deleting purchases, items, warranties and
  service events. Still simulated (toast only): the Settings actions (new forwarding address, adding senders, export, account deletion).
- Reading runs in a server action as the signed-in user (`imports/actions.ts`); the
  `start_import_processing` / `record_import_result` functions allow only the pipeline's
  own status changes. Untouched extracted values are saved with `state: "extracted"` in
  `field_meta`; a warranty is only stored when the document states it, with the quote.
  A service receipt is never attached to an item unless you pick it (or a serial /
  registration number makes it a clear match).
- Pages stay mounted after navigation (React Activity), so form fields use `useId()` for
  their ids: a hidden page's `id="merchant"` would otherwise capture another form's label.
