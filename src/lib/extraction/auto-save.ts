import type { Json } from "@/lib/supabase/database.types";
import { categoryValue, type ExtractedLine, type Tracked } from "@/lib/types";
import { guessCategory } from "./category";

// An invoice read more accurately than this is saved without waiting for review:
// a purchase (order confirmation or invoice) as it was read, a service on the car
// it's matched to beyond doubt, or on its own when it matches nothing. At or
// below it, or when something needs a person (a likely duplicate, totals that
// don't add up, a car that could be either of two), the user checks and confirms.

/** Above this overall reading accuracy (0–1), an invoice no longer needs a check. */
export const AUTO_SAVE_ACCURACY = 0.6;
/** The car must be matched this surely, and clearly ahead of any other (as in the review screen). */
const MATCH_SCORE = 0.9;
const MATCH_GAP = 0.15;

/**
 * Review notes that are information, not a problem to resolve: hard-to-read values
 * (already counted in the accuracy), fees explained by other invoices in the PDF,
 * details filled in from the email, a service that matches none of the user's items.
 * Any other note (a likely duplicate, a shipping update, totals that don't add up,
 * two readings that differ, something missing) keeps the invoice for review.
 */
const NOTE =
  /^(Some values were hard to read|The items come to|This PDF holds \d+ invoices|The total includes Urban Company's fees|Some details were filled in from the email|Not matched to an item you own)/;

const onlyNotes = (reasons: string[] = []) => reasons.every((r) => NOTE.test(r));

type Field = Tracked<string | number> | undefined;

/**
 * How sure the reader is of what it read overall: the average confidence of
 * every value it found (the fields, and each part's name and price).
 * Null when it found nothing.
 */
export function readingAccuracy(fields: Record<string, Field>, parts: ExtractedLine[] = []): number | null {
  const found = [...Object.values(fields), ...parts.flatMap((p) => [p.name, p.price])].filter(
    (t): t is NonNullable<Field> => t !== undefined && t.state !== "missing" && t.value !== null,
  );
  if (found.length === 0) return null;
  return found.reduce((sum, t) => sum + (t.state === "confirmed" ? 1 : (t.confidence ?? 0)), 0) / found.length;
}

interface Outcome {
  status: string;
  document_kind?: string;
  extracted?: Json;
  review_reasons?: string[];
  candidates?: Json;
}

/**
 * The service event to save for a reading that needs no check, or null when the
 * user should look first: not read accurately enough, anything flagged, or no
 * car matched beyond doubt (it's never attached on a guess).
 */
export function serviceAutoSave(outcome: Outcome) {
  if (outcome.status !== "needs_review" || outcome.document_kind !== "service_receipt") return null;
  if (!onlyNotes(outcome.review_reasons)) return null;

  const x = outcome.extracted as { fields?: Record<string, Field>; parts?: ExtractedLine[] } | undefined;
  const f = x?.fields ?? {};
  const date = f.date?.value;
  const work = f.workPerformed?.value;
  const total = f.total?.value;
  if (!date || !work || total === null || total === undefined) return null;

  const accuracy = readingAccuracy(f, x?.parts);
  if (accuracy === null || accuracy <= AUTO_SAVE_ACCURACY) return null;

  const ranked = ((outcome.candidates ?? []) as { item_id: string; score: number }[])
    .slice()
    .sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  // Matching none of the user's items, it's saved on its own (like a home service).
  // Matching some, but not one beyond doubt, the user picks: never attached on a guess.
  if (top && (top.score < MATCH_SCORE || (second && top.score - second.score <= MATCH_GAP))) return null;

  const odometer = f.odometerKm?.value;
  return {
    accuracy,
    event: {
      item_id: top?.item_id ?? null,
      service_date: String(date),
      work_performed: String(work),
      provider: f.provider?.value ? String(f.provider.value) : null,
      total_cost: Number(total),
      labour_cost: f.labourCost?.value != null ? Number(f.labourCost.value) : null,
      odometer_km: odometer != null ? Math.round(Number(odometer)) : null,
      parts: (x?.parts ?? [])
        .filter((p) => p.name.value)
        .map((p) => ({ name: String(p.name.value), cost: p.price.value ?? null, kind: p.kind ?? "part" })),
    } as Json,
  };
}

type PurchaseFields = Record<string, Field> & {
  merchant?: Tracked<string>;
  date?: Tracked<string>;
  orderRef?: Tracked<string>;
  invoiceRef?: Tracked<string>;
  total?: Tracked<number>;
  warrantyMonths?: Tracked<number>;
  warrantyEvidence?: Tracked<string>;
  returnBy?: Tracked<string>;
};

/** How a value was found, for the record: read (with how surely), not checked by the user. */
function meta(fields: Record<string, Field>) {
  const out: Record<string, { state: "extracted"; confidence?: number }> = {};
  for (const [column, t] of Object.entries(fields)) {
    if (t && t.state === "extracted" && t.value !== null) out[column] = { state: "extracted", confidence: t.confidence };
  }
  return out;
}

/**
 * The purchases to save (one per order) for an order confirmation or invoice that
 * needs no check, in the shape create_purchases_from_import takes; null when the
 * user should look first. Items get the same defaults as on the review screen:
 * a category from their name, the order's return date unless they can't be
 * returned, and a warranty only when the document's words for it were found.
 */
export function purchaseAutoSave(outcome: Outcome) {
  if (outcome.status !== "needs_review") return null;
  if (outcome.document_kind !== "order_confirmation" && outcome.document_kind !== "invoice") return null;
  if (!onlyNotes(outcome.review_reasons)) return null;

  const x = outcome.extracted as
    | { fields?: PurchaseFields; lines?: ExtractedLine[]; orders?: { ref: string; total: number; items: number[] }[] }
    | undefined;
  const f = x?.fields ?? {};
  const lines = x?.lines ?? [];
  const merchant = f.merchant?.value;
  const date = f.date?.value;
  if (!merchant || !date || lines.length === 0 || lines.some((l) => !String(l.name.value ?? "").trim())) return null;

  const accuracy = readingAccuracy(f, lines);
  if (accuracy === null || accuracy <= AUTO_SAVE_ACCURACY) return null;

  const item = (l: ExtractedLine) => {
    const months = (l.warrantyMonths ?? f.warrantyMonths)?.value;
    const evidence = (l.warrantyMonths ? l.warrantyEvidence : f.warrantyEvidence)?.value;
    const returnBy = (l.returnBy ?? (l.nonReturnable ? undefined : f.returnBy))?.value;
    return {
      name: String(l.name.value).trim(),
      category: categoryValue(guessCategory(String(l.name.value), merchant)),
      price: l.price.value ?? null,
      return_by: returnBy || null,
      field_meta: meta({ name: l.name, price: l.price, return_by: l.returnBy }),
      warranty: months && evidence ? { months, state: "extracted", evidence } : null,
    };
  };
  const purchase = (orderRef: string | null | undefined, total: number | null | undefined, items: ExtractedLine[]) => ({
    merchant: String(merchant),
    order_date: String(date),
    order_ref: orderRef || null,
    invoice_ref: f.invoiceRef?.value || null,
    total: total ?? null,
    field_meta: meta({ merchant: f.merchant, order_date: f.date, order_ref: f.orderRef, invoice_ref: f.invoiceRef, total: f.total }),
    items: items.map(item),
  });

  // An email confirming several orders: one purchase per order, as on the review screen.
  const purchases =
    x?.orders && x.orders.length > 1
      ? x.orders
          .map((o) => purchase(o.ref, o.total, o.items.map((i) => lines[i]).filter(Boolean)))
          .filter((p) => p.items.length > 0)
      : [purchase(f.orderRef?.value, f.total?.value, lines)];
  if (purchases.length === 0) return null;
  return { accuracy, purchases: purchases as unknown as Json };
}

/**
 * Why a reading above the threshold still waits for the user, in words for the
 * review screen; null when nothing holds it back (then only saving it failed).
 */
export function autoSaveHold(outcome: Outcome): string | null {
  const isService = outcome.document_kind === "service_receipt";
  const reasons = outcome.review_reasons ?? [];
  if (!onlyNotes(reasons)) return "one of the notes below needs you";
  const x = outcome.extracted as { fields?: PurchaseFields & Record<string, Field>; lines?: ExtractedLine[] } | undefined;
  const f = x?.fields ?? {};
  if (isService) {
    if (!f.date?.value) return "no service date was found";
    if (!f.workPerformed?.value) return "the work done wasn't found";
    if (f.total?.value == null) return "no total was found";
    return serviceAutoSave(outcome) ? null : "it matches more than one of your items, so choose the right one";
  }
  if (!f.merchant?.value) return "the shop's name wasn't found";
  if (!f.date?.value) return "no order date was found";
  const lines = x?.lines ?? [];
  if (lines.length === 0) return "no items were found";
  if (lines.some((l) => !String(l.name.value ?? "").trim())) return "an item has no name";
  return null;
}
