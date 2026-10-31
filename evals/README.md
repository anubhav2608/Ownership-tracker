# Reader evals

How well the app reads shop emails and invoices, measured against answers
written by hand. `npm run eval` reads every case with the same code as a real
import and writes `evals/out/report.md`: accuracy per shop and per field, and
every miss.

## Folders

- `evals/cases/`: fictional emails and invoices, in the repo. Run on every change.
- `evals/private/`: **your real emails**. Ignored by Git: they stay on your computer.

Run one folder with `EVAL_SET=cases npm run eval` or `EVAL_SET=private npm run eval`.

## Adding a case

Put two files side by side with the same name:

1. The document: an `.eml` (in Gmail: ⋮ → Download message), a `.pdf`, or a
   `.txt` with an email's text pasted in.
2. `<name>.expected.json`, the right answer. Leave out anything you don't want scored:

```json
{
  "kind": "purchase",
  "shop": "Flipkart",
  "orderRef": "OD330012345678901100",
  "date": "2026-10-24",
  "total": 1099,
  "items": [{ "name": "Example Steam Iron 1200W (White)", "qty": 1, "price": 1099 }]
}
```

- `kind`: `purchase`, `service`, `cancellation`, `return_or_refund`,
  `shipping_update` or `not_a_receipt` (newsletters, unreadable scans).
- `total`: what was paid; for a return, cancellation or refund, the money back.
- Item names can be shortened as the shop writes them ("Example Body W...").
- For a return or cancellation, add the purchase it belongs to and which items
  went back, to score the automatic ticking:

```json
  "purchase": { "items": [{ "id": "wash", "name": "Example Body Wash", "price": 503 }, { "id": "oil", "name": "Example Oil", "price": 220 }] },
  "itemsBack": ["wash"]
```

- A `.txt` has no email headers: give `"input": { "sentOn": "2026-10-24" }` if
  the text has no date of its own.

Aim for about five of each kind per shop you use: orders with one and several
items, cancellations, returns, refunds and shipping updates.

## What fails the run

- **Hard rules** (always): a cancellation, return, refund or shipping update read
  as a new purchase; an item ticked that didn't go back.
- **Thresholds** in `thresholds.json`: kind, order ID, date and total ≥ 97–98%,
  item price and items found ≥ 95%, no junk items ≥ 98%, right ticks ≥ 99%.

## On real use

Every save from a review screen also records what you changed from what was
read. Settings → *How well emails are read* shows how many imports needed no
changes and which fields are corrected most, per shop.
