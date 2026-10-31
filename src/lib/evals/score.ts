import { LOW_CONFIDENCE } from "@/lib/confidence";
import type { Extraction } from "@/lib/extraction/parse";

// Scoring the email and PDF reader against hand-written answers (evals/).
// One case is one import: what kind of document it is, its fields and items,
// and for a return or cancellation, which of the purchase's items went back.

/** What the user would see the document as. */
export type EvalKind = "purchase" | "service" | "cancellation" | "return_or_refund" | "shipping_update" | "not_a_receipt";

export interface ExpectedItem {
  name: string;
  qty?: number;
  price?: number;
}

/** A case's expected answer (`<case>.expected.json`). Leave out anything not to be scored. */
export interface Expected {
  /** Only for a .txt case (an email's text without its headers): when it was sent and by whom. */
  input?: { sentOn?: string; sender?: string };
  kind: EvalKind;
  shop?: string;
  orderRef?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** What was paid; for a return, cancellation or refund, the money back. */
  total?: number;
  items?: ExpectedItem[];
  /** For a return or cancellation: the purchase it's applied to, and which of its items went back. */
  purchase?: { items: { id: string; name: string; price: number | null }[] };
  itemsBack?: string[];
}

export interface Reading {
  kind: EvalKind;
  extraction: Extraction | null;
  /** For a return or cancellation with a purchase given: the items ticked. */
  ticked?: string[];
}

export type Field = "kind" | "shop" | "orderRef" | "date" | "total" | "itemPrice" | "itemQty";

export interface Miss {
  field: Field | "item" | "extraItem" | "tick";
  expected: unknown;
  got: unknown;
  /** The reader marked the value as hard to read (shown highlighted). */
  flagged?: boolean;
}

export interface CaseScore {
  name: string;
  shop: string;
  /** Fields checked and fields right, by field. */
  checked: Partial<Record<Field, number>>;
  right: Partial<Record<Field, number>>;
  items: { expected: number; found: number; matched: number };
  ticks?: { expected: number; ticked: number; right: number };
  misses: Miss[];
  /** Rules that must never break. */
  violations: string[];
}

/** How the user would see an extraction. */
export function kindOf(x: Extraction | null): EvalKind {
  if (!x) return "not_a_receipt";
  if (x.documentKind === "refund_notice") return x.fields.outcome?.value === "cancelled" ? "cancellation" : "return_or_refund";
  if (x.documentKind === "service_receipt") return "service";
  if (x.update) return "shipping_update";
  return "purchase";
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/(\.\.\.|…)\s*$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Whether two item names are the same item: one's words begin the other's, or most are shared. */
export function sameItem(a: string, b: string) {
  const [x, y] = [words(a), words(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === 0) return false;
  if (short.every((w, i) => long[i] === w)) return true;
  return short.filter((w) => long.includes(w)).length / short.length >= 0.8;
}

const low = (confidence?: number) => confidence !== undefined && confidence < LOW_CONFIDENCE;

export function scoreCase(name: string, expected: Expected, reading: Reading): CaseScore {
  const x = reading.extraction;
  const f = x?.fields;
  const score: CaseScore = {
    name,
    shop: expected.shop ?? "Other",
    checked: {},
    right: {},
    items: { expected: 0, found: 0, matched: 0 },
    misses: [],
    violations: [],
  };
  const check = (field: Field, ok: boolean, want: unknown, got: unknown, flagged?: boolean) => {
    score.checked[field] = (score.checked[field] ?? 0) + 1;
    if (ok) score.right[field] = (score.right[field] ?? 0) + 1;
    else score.misses.push({ field, expected: want, got, flagged });
  };

  check("kind", reading.kind === expected.kind, expected.kind, reading.kind);
  // The costly mistakes: a notice or an update saved as a new purchase.
  if (["cancellation", "return_or_refund", "shipping_update"].includes(expected.kind) && reading.kind === "purchase") {
    score.violations.push(`${expected.kind.replace(/_/g, " ")} read as a new purchase`);
  }

  const shop = f?.merchant?.value ?? f?.provider?.value ?? null;
  if (expected.shop !== undefined) {
    check("shop", (shop ?? "").toLowerCase() === expected.shop.toLowerCase(), expected.shop, shop, low(f?.merchant?.confidence));
  }
  if (expected.orderRef !== undefined) {
    const got = f?.orderRef?.value ?? null;
    check("orderRef", got === expected.orderRef, expected.orderRef, got, low(f?.orderRef?.confidence));
  }
  if (expected.date !== undefined) {
    const got = f?.date?.value ?? null;
    check("date", got === expected.date, expected.date, got, low(f?.date?.confidence));
  }
  if (expected.total !== undefined) {
    const got = f?.total?.value ?? null;
    check("total", got !== null && Math.abs(got - expected.total) < 0.01, expected.total, got, low(f?.total?.confidence));
  }

  if (expected.items) {
    const found = x ? (x.lines.length ? x.lines : x.parts) : [];
    const free = [...found];
    score.items = { expected: expected.items.length, found: found.length, matched: 0 };
    for (const want of expected.items) {
      const at = free.findIndex((l) => sameItem(l.name.value ?? "", want.name));
      if (at < 0) {
        score.misses.push({ field: "item", expected: want.name, got: null });
        continue;
      }
      const [got] = free.splice(at, 1);
      score.items.matched++;
      if (want.price !== undefined) {
        const p = got.price.value;
        check("itemPrice", p !== null && Math.abs(p - want.price) < 0.01, `${want.name}: ${want.price}`, p, low(got.price.confidence));
      }
      if (want.qty !== undefined) check("itemQty", got.quantity === want.qty, `${want.name}: ${want.qty}`, got.quantity);
    }
    for (const extra of free) score.misses.push({ field: "extraItem", expected: null, got: extra.name.value });
  }

  if (expected.itemsBack && reading.ticked) {
    const want = new Set(expected.itemsBack);
    const right = reading.ticked.filter((id) => want.has(id));
    score.ticks = { expected: want.size, ticked: reading.ticked.length, right: right.length };
    const wrong = reading.ticked.filter((id) => !want.has(id));
    if (wrong.length) {
      score.violations.push(`ticked an item that didn't go back (${wrong.join(", ")})`);
      score.misses.push({ field: "tick", expected: expected.itemsBack, got: reading.ticked });
    } else if (right.length < want.size) {
      score.misses.push({ field: "tick", expected: expected.itemsBack, got: reading.ticked });
    }
  }
  return score;
}

export interface Summary {
  cases: number;
  /** Right / checked, by field, over all cases. */
  accuracy: Partial<Record<Field, number>>;
  itemPrecision: number | null;
  itemRecall: number | null;
  tickPrecision: number | null;
  tickRecall: number | null;
  /** Of the wrong values, the share the reader had highlighted. */
  flaggedShare: number | null;
  violations: { name: string; rule: string }[];
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function summarize(scores: CaseScore[]): Summary {
  const fields: Field[] = ["kind", "shop", "orderRef", "date", "total", "itemPrice", "itemQty"];
  const sum = (pick: (s: CaseScore) => number) => scores.reduce((t, s) => t + pick(s), 0);
  const accuracy: Partial<Record<Field, number>> = {};
  for (const field of fields) {
    const r = ratio(sum((s) => s.right[field] ?? 0), sum((s) => s.checked[field] ?? 0));
    if (r !== null) accuracy[field] = r;
  }
  const wrongValues = scores.flatMap((s) => s.misses.filter((m) => m.flagged !== undefined));
  return {
    cases: scores.length,
    accuracy,
    itemPrecision: ratio(sum((s) => s.items.matched), sum((s) => s.items.found)),
    itemRecall: ratio(sum((s) => s.items.matched), sum((s) => s.items.expected)),
    tickPrecision: ratio(sum((s) => s.ticks?.right ?? 0), sum((s) => s.ticks?.ticked ?? 0)),
    tickRecall: ratio(sum((s) => s.ticks?.right ?? 0), sum((s) => s.ticks?.expected ?? 0)),
    flaggedShare: ratio(wrongValues.filter((m) => m.flagged).length, wrongValues.length),
    violations: scores.flatMap((s) => s.violations.map((rule) => ({ name: s.name, rule }))),
  };
}
