# Ownership Tracker

Keep every purchase, invoice, warranty and service record for the things you own.
Records come in by forwarding emails, uploading invoices, or entering them by hand.

This is the **UI prototype**: every screen is built and clickable, backed by mock data.
Supabase (auth, database, storage) and the email-ingest pipeline come next.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. "View demo" on the landing page goes straight to the dashboard.

## Screens

| Route | What it's for |
| --- | --- |
| `/` | Landing page |
| `/login` (`?mode=signup`) | Log in / sign up (Google or magic link) |
| `/onboarding` | Welcome, shows the private forwarding address |
| `/dashboard` | Stats, records needing review, upcoming reminders, recent items |
| `/items` | Search and filter everything owned (active / past, by category) |
| `/items/[id]` | Purchase, invoice, warranty progress, service history timeline, status |
| `/add` (`?tab=forward\|upload\|manual`) | The three ways to add a record |
| `/inbox` | Records being processed, needing review, or that failed |
| `/inbox/[id]` | Review extracted fields (with confidence), split line items, match to existing items |
| `/settings` | Forwarding address, verified senders, notifications, account |

## Structure

```
src/
  app/
    (app)/          signed-in screens, share the sidebar / bottom-nav shell
    login/ onboarding/ page.tsx   public screens
  components/
    ui.tsx          Card, Badge, Button, Field, PageHeader, EmptyState
    item-bits.tsx   category icons, status and warranty badges
    inbox-bits.tsx  inbox status badge, confidence dot
    app-shell.tsx   navigation
  lib/
    types.ts        domain model (Item, ServiceEvent, InboxRecord, Reminder)
    mock-data.ts    sample data + async getters (swap these for Supabase queries)
    format.ts       money/date formatting, locale and currency in one place
```

Colours are semantic tokens in `src/app/globals.css` (`bg-surface`, `text-muted`,
`bg-accent`, …), with a dark-mode set that follows the system setting.

## Notes

- Next.js 16 with Cache Components: request-time data (anything that reads "today")
  is fetched through the async getters in `lib/mock-data.ts`, which call `connection()`.
  Keep that pattern when the real Supabase queries replace them.
- Forms don't persist yet. Adding a service event updates local state only; other
  forms just navigate.
