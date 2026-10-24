import type { DocumentKind, ExtractedLine, Tracked } from "@/lib/types";
import { amountsIn, moneyIn, parseDate } from "./values";

// Deterministic extraction from a document's text lines (spec §4C). Known
// merchants and labelled values ("Order Date:", "Grand Total") give high
// confidence; guesses give low confidence so the review screen highlights them.

export interface ExtractedFields {
  merchant?: Tracked<string>;
  orderRef?: Tracked<string>;
  invoiceRef?: Tracked<string>;
  date?: Tracked<string>;
  total?: Tracked<number>;
  warrantyMonths?: Tracked<number>;
  warrantyEvidence?: Tracked<string>;
  provider?: Tracked<string>;
  workPerformed?: Tracked<string>;
  labourCost?: Tracked<number>;
}

export interface Extraction {
  documentKind: DocumentKind;
  /** Template id for a recognised format, otherwise the generic parser. */
  parser: string;
  fields: ExtractedFields;
  lines: ExtractedLine[];
  parts: ExtractedLine[];
  reviewReasons: string[];
}

export type ParseOutcome =
  | { ok: true; extraction: Extraction }
  | { ok: false; reason: "no_text" | "not_a_receipt" };

const extracted = <T,>(value: T, confidence: number): Tracked<T> => ({
  value,
  state: "extracted",
  confidence: Math.round(confidence * 100) / 100,
});
const missing = <T,>(): Tracked<T> => ({ value: null, state: "missing" });

// ── Merchants ───────────────────────────────────────────────────────────

interface KnownMerchant {
  id: string;
  name: string;
  pattern: RegExp;
  orderRef?: RegExp;
  service?: boolean;
}

const MERCHANTS: KnownMerchant[] = [
  { id: "amazon-in", name: "Amazon", pattern: /\bamazon(\.in)?\b/i, orderRef: /\b(\d{3}-\d{7}-\d{7})\b/ },
  { id: "flipkart", name: "Flipkart", pattern: /\bflipkart\b/i, orderRef: /\b(OD\d{12,20})\b/ },
  { id: "croma", name: "Croma", pattern: /\bcroma\b/i },
  { id: "reliance-digital", name: "Reliance Digital", pattern: /\breliance digital\b/i },
  { id: "vijay-sales", name: "Vijay Sales", pattern: /\bvijay sales\b/i },
  { id: "apple", name: "Apple Store", pattern: /\bapple (store|india)\b/i, orderRef: /\b(W\d{9,12})\b/ },
  { id: "myntra", name: "Myntra", pattern: /\bmyntra\b/i },
  { id: "urban-company", name: "Urban Company", pattern: /\burban ?(company|clap)\b/i, service: true },
];

// ── Document kind ───────────────────────────────────────────────────────

const KIND_SIGNALS: [DocumentKind, RegExp][] = [
  ["refund_notice", /\b(refund (processed|initiated|issued)|credit note|refunded)\b/i],
  ["service_receipt", /\b(service (invoice|report|receipt|charge)|job card|repair order|technician|labou?r|servicing|visit charge|spare parts?)\b/i],
  ["invoice", /\b(tax invoice|invoice (no|number|date)|bill of supply|invoice)\b/i],
  ["order_confirmation", /\b(order (confirmation|placed|confirmed)|your order|thank you for (your )?(order|shopping))\b/i],
];

function classify(text: string, merchant?: KnownMerchant): DocumentKind {
  if (merchant?.service) return "service_receipt";
  for (const [kind, pattern] of KIND_SIGNALS) if (pattern.test(text)) return kind;
  return "other";
}

// ── Fields ──────────────────────────────────────────────────────────────

const label = (words: string) => new RegExp(`\\b(?:${words})\\b\\s*(?:no\\.?|number|#|id)?\\s*[:#-]?\\s*`, "i");

function findMerchant(lines: string[], text: string) {
  const known = MERCHANTS.find((m) => m.pattern.test(text));
  if (known) return { known, field: extracted(known.name, 0.95) };

  for (const line of lines) {
    const m = line.match(/\b(?:sold by|seller|billed by|from)\s*[:-]\s*(.{3,60})$/i);
    if (m) return { field: extracted(cleanName(m[1]), 0.75) };
  }
  const first = lines.find((l) => /[a-z]{3}/i.test(l) && !/invoice|receipt|order|page \d/i.test(l));
  return { field: first ? extracted(cleanName(first), 0.5) : missing<string>() };
}

const cleanName = (s: string) => s.replace(/\s{2,}.*/, "").replace(/[,.;:]+$/, "").trim();

/** A reference after a label like "Order No:" — has a digit and isn't a date. */
function labelledRef(lines: string[], words: string): string | null {
  const labelled = label(words);
  for (const line of lines) {
    const m = line.match(labelled);
    if (!m) continue;
    const rest = line.slice((m.index ?? 0) + m[0].length);
    const ref = rest.match(/^([A-Z0-9][A-Z0-9\-/]{3,30})/i);
    if (ref && /\d/.test(ref[1]) && !parseDate(ref[1])) return ref[1];
  }
  return null;
}

/** The order number and the invoice (or bill / receipt) number: either identifies the purchase. */
function findRefs(lines: string[], text: string, merchant?: KnownMerchant) {
  const known = merchant?.orderRef && text.match(merchant.orderRef);
  const order = known ? known[1] : labelledRef(lines, "order");
  const invoice = labelledRef(lines, "invoice|bill|receipt|job card|ro");
  return {
    orderRef: order ? extracted(order, known ? 0.98 : 0.85) : missing<string>(),
    invoiceRef: invoice && invoice !== order ? extracted(invoice, 0.85) : missing<string>(),
  };
}

function findDate(lines: string[]): Tracked<string> {
  const labelled = /\b(order date|invoice date|date of (purchase|service|invoice)|bill date|service date|dated?)\b/i;
  for (const line of lines) {
    if (!labelled.test(line)) continue;
    const date = parseDate(line.slice(line.search(labelled)));
    if (date) return extracted(date, 0.92);
  }
  for (const line of lines) {
    const date = parseDate(line);
    if (date) return extracted(date, 0.6);
  }
  return missing();
}

const TOTAL_LABELS: [RegExp, number][] = [
  [/\b(grand total|total amount( payable)?|amount payable|net payable|invoice (total|value)|total payable)\b/i, 0.92],
  [/\btotal\b/i, 0.78],
];

function findTotal(lines: string[]): Tracked<number> {
  // One PDF can hold several invoices for one order (e.g. the goods, then a
  // platform fee). What was paid is the sum of their totals.
  const starts = lines.flatMap((l, i) => (/^tax invoice\b/i.test(l) ? [i] : []));
  if (starts.length > 1) {
    const totals = starts.map((start, n) => findTotal(lines.slice(start + 1, starts[n + 1])));
    if (totals.every((t) => t.value !== null)) {
      const sum = Math.round(totals.reduce((s, t) => s + t.value!, 0) * 100) / 100;
      return extracted(sum, Math.min(...totals.map((t) => t.confidence ?? 0)));
    }
  }
  for (const [pattern, confidence] of TOTAL_LABELS) {
    // The last labelled line wins: invoices list "Total" per row before the grand total.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!pattern.test(line) || /\b(sub ?total|tax|gst|in words|discount)\b/i.test(line)) continue;
      const amounts = amountsIn(line.slice(line.search(pattern)));
      const value = amounts.at(-1) ?? amountsIn(lines[i + 1] ?? "").at(-1);
      if (value !== undefined && value > 0) return extracted(value, confidence);
    }
  }
  const all = lines.flatMap(moneyIn);
  return all.length ? extracted(Math.max(...all), 0.45) : missing();
}

function findWarranty(lines: string[]) {
  for (const line of lines) {
    const m =
      line.match(/(\d{1,2})\s*(years?|yrs?|months?)\b[^.]{0,40}\bwarranty\b/i) ??
      line.match(/\bwarranty\b[^\d]{0,30}(\d{1,2})\s*(years?|yrs?|months?)\b/i);
    if (m) {
      const months = /^y/i.test(m[2]) ? Number(m[1]) * 12 : Number(m[1]);
      if (months > 0 && months <= 600) {
        return { months: extracted(months, 0.85), evidence: extracted(`"${line.trim()}"`, 0.85) };
      }
    }
  }
  return null;
}

// ── Line items ──────────────────────────────────────────────────────────

const NOT_AN_ITEM =
  /\b(sub ?total|total|tax|gst|cgst|sgst|igst|cess|discount|shipping|delivery|convenience|fees?|round(ing)? off|amount in words|payment|paid|balance|invoice|order (no|number|id|date)|date|pan|gstin|address|phone|email|page|qty|quantity|description|unit price|rate)\b/i;
const LABOUR = /\b(labou?r|service|servicing|visit charge|inspection|installation)\b/i;
/** A numbered table row: "1  Description  ...amounts". */
const TABLE_ROW = /^\d{1,3}[.)]?\s+(?=.*[a-z]{3})/i;

/** Product codes and tax-code lines that sit between an item's name and its amounts. */
const TAX_CODE_LINE = /^\s*(hsn|sac)\b/i;
/** How far below its name an item's row of amounts may be. */
const MAX_ROW_GAP = 4;

const cleanDescription = (s: string) =>
  s
    .replace(/^\d{1,3}[.)]?\s+/, "")
    // Leading SKU codes: "UCFBSWSH75090392 - United Colors of Benetton …"
    .replace(/^[A-Z0-9]{6,}\s+[-–:]\s+/, "")
    .replace(/\s*[|(]?\s*\bHSN\b.*$/i, "")
    .replace(/\s*\|.*$/, "")
    .trim();

/**
 * Item rows with their line total (the amount paid for that line, which is
 * the last amount on the row). Numbered table rows are items even when they
 * mention tax; other lines are skipped if they look like totals or headers.
 */
function findLines(lines: string[]): ExtractedLine[] {
  const items: ExtractedLine[] = [];
  // A name waiting for its amounts: some invoices print the name, then tax
  // codes, then a row of amounts ("1  Rs 1799.00 … Rs 755.00").
  let pending: { text: string; at: number } | null = null;

  for (const [i, raw] of lines.entries()) {
    if (TAX_CODE_LINE.test(raw)) continue;
    const tableRow = TABLE_ROW.test(raw);
    if (!tableRow && NOT_AN_ITEM.test(raw)) {
      pending = null;
      continue;
    }
    const prices = moneyIn(raw);
    if (prices.length === 0) {
      if (!/[a-z]{3}/i.test(raw) && !/^\(.*\)$/.test(raw.trim())) continue;
      // "(7-8Y)" right under a name continues it; any other text starts a new candidate.
      const continues: boolean =
        pending !== null && i - pending.at === 1 && (/^\(/.test(raw) || (raw.length < 25 && !raw.includes(":")));
      pending = continues && pending ? { text: `${pending.text} ${raw}`, at: i } : { text: raw, at: i };
      continue;
    }

    if (!/[a-z]{3}/i.test(raw)) {
      // A row of amounts only: it belongs to the name just above, if there is one.
      if (pending && i - pending.at <= MAX_ROW_GAP) {
        const description = cleanDescription(pending.text);
        const qty = raw.trim().match(/^(\d{1,3})(?:\.0+)?\s/);
        if (/[a-z]{3}/i.test(description) && description.length <= 160) {
          items.push({
            name: extracted(description, 0.8),
            quantity: Number(qty?.[1] ?? 1) || 1,
            price: extracted(prices.at(-1)!, 0.8),
          });
        }
      }
      pending = null;
      if (items.length >= 30) break;
      continue;
    }
    pending = null;

    const columns = raw.split(/\s{2,}/).map((c) => c.trim());
    const descIndex = columns.findIndex((c) => /[a-z]{3}/i.test(c) && moneyIn(c).length === 0);
    const description = cleanDescription(descIndex >= 0 ? columns[descIndex] : raw.replace(/[₹\d.,\s]+$/, ""));
    if (!/[a-z]{3}/i.test(description) || description.length > 160) continue;

    // Quantity: a small whole-number column after the description, or "Qty 2" / "x 2".
    const qtyColumn = columns.slice(descIndex + 1).find((c) => /^\d{1,3}$/.test(c));
    const qtyLabel = raw.match(/\b(?:qty|x)\s*[:.]?\s*(\d{1,3})\b/i);
    const quantity = Number(qtyColumn ?? qtyLabel?.[1] ?? 1) || 1;

    const confidence = tableRow || columns.length >= 3 ? 0.88 : 0.7;
    items.push({
      name: extracted(description, confidence),
      quantity,
      price: extracted(prices.at(-1)!, confidence),
    });
    if (items.length >= 30) break;
  }
  return items;
}

// ── Putting it together ─────────────────────────────────────────────────

export function parseDocument(lines: string[]): ParseOutcome {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  const text = clean.join("\n");
  if (text.replace(/\s/g, "").length < 20) return { ok: false, reason: "no_text" };

  const { known, field: merchant } = findMerchant(clean, text);
  const documentKind = classify(text, known);
  const date = findDate(clean);
  const total = findTotal(clean);
  if (documentKind === "other" && (date.value === null || total.state === "missing")) {
    return { ok: false, reason: "not_a_receipt" };
  }

  const found = findLines(clean);
  const fields: ExtractedFields = { date, total };
  let lineItems: ExtractedLine[] = [];
  let parts: ExtractedLine[] = [];

  if (documentKind === "service_receipt") {
    fields.provider = merchant;
    const labour = found.filter((l) => LABOUR.test(l.name.value ?? ""));
    parts = found.filter((l) => !labour.includes(l));
    const labourTotal = labour.reduce((s, l) => s + (l.price.value ?? 0), 0);
    if (labour.length) fields.labourCost = extracted(labourTotal, 0.7);
    const work = labour[0]?.name.value ?? found[0]?.name.value;
    fields.workPerformed = work ? extracted(work, 0.6) : missing();
  } else {
    fields.merchant = merchant;
    Object.assign(fields, findRefs(clean, text, known));
    lineItems = found;
    const warranty = findWarranty(clean);
    if (warranty) {
      fields.warrantyMonths = warranty.months;
      fields.warrantyEvidence = warranty.evidence;
    }
  }

  corroborate(fields, documentKind === "service_receipt" ? parts : lineItems);
  const reviewReasons = validate(documentKind, fields, lineItems, parts);
  return {
    ok: true,
    extraction: {
      documentKind,
      parser: known ? `${known.id}@v1` : "generic@v1",
      fields,
      lines: lineItems,
      parts,
      reviewReasons,
    },
  };
}

/** Items that add up exactly to the total vouch for each other's amounts. */
function corroborate(fields: ExtractedFields, rows: ExtractedLine[]) {
  const total = fields.total;
  if (!total?.value || rows.length === 0) return;
  const sum = rows.reduce((s, l) => s + (l.price.value ?? 0), 0) + (fields.labourCost?.value ?? 0);
  if (Math.abs(sum - total.value) > 1) return;
  const raise = (f: Tracked<number>) => {
    if (f.state === "extracted") f.confidence = Math.max(f.confidence ?? 0, 0.95);
  };
  raise(total);
  rows.forEach((l) => raise(l.price));
  if (fields.labourCost) raise(fields.labourCost);
}

function validate(
  kind: DocumentKind,
  fields: ExtractedFields,
  lines: ExtractedLine[],
  parts: ExtractedLine[],
): string[] {
  const reasons: string[] = [];
  const isService = kind === "service_receipt";
  const rows = isService ? parts : lines;

  if (fields.total?.state === "missing") reasons.push("No total found. Enter the amount paid.");
  if (fields.date?.state === "missing") reasons.push("No date found.");
  if (!isService && rows.length === 0) reasons.push("Couldn't find the items. Add them below.");

  const total = fields.total?.value;
  // Line prices are line totals, so they add up without multiplying by quantity.
  const sum = rows.reduce((s, l) => s + (l.price.value ?? 0), 0) + (fields.labourCost?.value ?? 0);
  if (total && rows.length && Math.abs(sum - total) > 1) {
    reasons.push("Items don't add up to the total. Check for shipping, fees, discounts or a misread price.");
  }

  const fieldList = [...Object.values(fields), ...rows.flatMap((l) => [l.name, l.price])];
  if (fieldList.some((f) => f && f.state === "extracted" && (f.confidence ?? 1) < 0.8)) {
    reasons.push("Some values were hard to read. Check the highlighted fields.");
  }
  return reasons;
}
