# Ownership Tracker

One place to find what you bought, retrieve its records, and track what happens to it
while you own it.

Status: signed-in users see their own data from Supabase. Forwarded emails (body and PDF
attachments) and uploaded PDFs are read automatically, checked, and wait for your review
before anything is saved. Scans and photos need OCR, which comes later. Purchases and
service events can also be entered by hand. Without Supabase settings the app runs as a demo on fictional sample data.

## Run it

Needs Node.js 20.9 or newer (`node -v`).

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

### Forwarded emails (Resend)

Each user gets a private address, `u_<token>@<INBOUND_EMAIL_DOMAIN>` (Settings). Nothing
connects to anyone's mailbox; users forward only what they choose.

1. In Resend, set up receiving: a Resend-provided receiving address domain, or your own
   domain with the MX record Resend gives you. Put that domain in `INBOUND_EMAIL_DOMAIN`.
2. Add a webhook for the `email.received` event pointing at
   `https://<your-app>/api/inbound/resend`, and put its signing secret in
   `RESEND_WEBHOOK_SECRET`.
3. Create an API key and put it in `RESEND_API_KEY`; the webhook only carries metadata,
   so the app fetches the message and its attachments with it.
4. Set `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API keys → secret key).
   Server only; never commit it or prefix it with `NEXT_PUBLIC_`.
5. Set the same variables on Vercel. Resend can't reach `localhost`, so test the webhook
   on a deployment (or through a tunnel such as `cloudflared tunnel --url localhost:3000`).

How it works: the endpoint accepts only correctly signed deliveries, routes by the
forwarding address (unknown addresses are acknowledged and dropped), and stores the
message and its PDF / image attachments as private documents. Mail from an address that
isn't a verified sender (your sign-in email is verified at signup) is held unread; the
import page offers to trust the sender, after which their mail is read automatically.
Redelivered webhooks and re-forwarded messages are recognised. Reading prefers an attached
PDF invoice, then the email body, and runs after the webhook has responded.

### Gmail without forwarding (Apps Script)

Settings → Gmail creates a personal key (shown once; only its SHA-256 hash is stored) and
gives a Google Apps Script with it filled in. The user pastes it into script.google.com in
their own account and runs `setup()`; every 15 minutes it posts each email they've labelled
"Ownership" (raw, with attachments) to `/api/inbound/raw` with the key, then moves it to
"Ownership/Sent". The app never gets Gmail access. Mail sent with the key is read without
the verified-sender check (the key proves it's the user's). Needs `SUPABASE_SECRET_KEY` and
a public address for the app (a deployment, or a tunnel to your computer).

Senders listed in Settings (addresses or domains) are written into the script's `SENDERS`;
their emails with an order word in the subject are sent without a label (the last 30 days
on `setup()`, then 3 days on each check), with `X-Ownership-Auto: 1`. The app drops those
that turn out not to be purchases, or duplicates, instead of keeping an import.

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
    extraction/         PDF text (pdfjs), email bodies (HTML → lines), parsing with merchant
                        templates, validation, service-item matching; tests use fictional
                        PDFs (generated with pdf-lib) and emails
    inbound/            storing forwarded emails from the Resend webhook
                        (app/api/inbound/resend)
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
  receiving forwarded emails, reading emails and uploaded PDFs, trusting a held
  sender, reviewing and saving what was read (or retrying), manual
  purchases and service events, and editing and deleting purchases, items, warranties and
  service events. Still simulated (toast only): the Settings actions (new forwarding address, adding senders, export, account deletion).
- Reading runs in a server action as the signed-in user (`imports/actions.ts`); the
  `start_import_processing` / `record_import_result` functions allow only the pipeline's
  own status changes. Untouched extracted values are saved with `state: "extracted"` in
  `field_meta`; a warranty is only stored when the document states it, with the quote.
  A service receipt is never attached to an item unless you pick it (or a serial /
  registration number makes it a clear match).
- Emails can also be uploaded as saved `.eml` files. An email and its attachments are
  read together: the most complete document (usually the attached invoice) leads, and
  the others fill in what it lacks (order number, return-by date, warranty wording).
- Warranty and "Return by" are per item. Terms printed under an item are that item's;
  terms in the footer apply to the items that state none (a non-returnable item keeps
  none). A return period is counted from the order date. Both can be set per item on
  the review screen and in manual entry.
- The dashboard's "Total expenses" shows this month by default, with filters for period
  (or from/to dates), category and merchant.
- Purchases, items and service events can have any number of documents attached, each
  with a type; anything else is filed as Miscellaneous (stored as `other`).
- A purchase's order number and invoice number each identify it: no two purchases share
  one (case-insensitive; unique indexes plus a check in `create_manual_purchase`). Saving
  one that exists asks whether to override it; overriding deletes the old purchase (items,
  warranties, service history, source import, unattached files) and saves the new one in
  the same transaction.
- Pages stay mounted after navigation (React Activity), so form fields use `useId()` for
  their ids: a hidden page's `id="merchant"` would otherwise capture another form's label.
