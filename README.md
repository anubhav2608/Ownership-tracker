# Ownership Tracker

One place to find what you bought, retrieve its records, and track what happens to it
while you own it.

This is the **UI prototype** for the MVP in the product spec: every screen is built and
clickable on fictional sample data. Supabase (auth, Postgres, private storage), the
Resend inbound webhook and the extraction pipeline come next.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. "View demo" on the landing page goes straight to the dashboard.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · shadcn/ui (Radix, new-york style)
· lucide icons · sonner toasts. `components.json` is set up, so `npx shadcn@latest add <name>`
works where `ui.shadcn.com` is reachable.

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
  lib/
    types.ts            domain model: Order, Item, StoredDocument, ServiceEvent, ImportRecord
    mock-data.ts        fictional sample data + async getters (swap for Supabase queries)
    format.ts           money / date formatting (locale and currency in one place)
    utils.ts            cn()
```

The types mirror the planned tables. Values that can come from extraction use
`Tracked<T>` (`value` + `state: "missing" | "extracted" | "confirmed"` + `confidence`),
so the UI can always say where a value came from.

Theme tokens (shadcn's plus `success`, `warning`, `danger`, `info` and their `-soft`
variants) live in `src/app/globals.css`, with a dark set that follows the system setting.

## Notes

- Cache Components is on (Next 16 default). Request-time data goes through the async
  getters in `lib/mock-data.ts`, which call `connection()`. Keep that pattern when the
  Supabase queries replace them.
- Actions are simulated: they update local state or show a toast. Nothing persists yet.
