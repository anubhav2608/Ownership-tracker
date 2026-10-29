import type { DocumentKind, ExtractedLine, ServiceLineKind, Tracked } from "@/lib/types";
import { otherCharges } from "@/lib/charges";
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
  /** Last day to return, YYYY-MM-DD. */
  returnBy?: Tracked<string>;
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
  [
    "refund_notice",
    /\b(refund (processed|initiated|issued)|credit note|refunded)\b|\b(your|the|a) refund\b[^.\n]{0,60}\b(has been|was|is being|is) (processed|initiated|issued|credited)\b/i,
  ],
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

const MONEY = String.raw`(?:₹|rs\.?|inr)\s?-?\s?([\d,]+(?:\.\d{1,2})?)`;
const REFUND_AMOUNT: [RegExp, number][] = [
  // "your refund for ₹503.00 has been processed"
  [new RegExp(String.raw`\brefund (?:for|of)\s*${MONEY}`, "i"), 0.95],
  [new RegExp(String.raw`\b(?:total refund|refund amount|amount refunded|refund total|total refunded)\b[^\d₹]{0,20}${MONEY}`, "i"), 0.9],
  // "Original Payment Method: ₹503.00": what is credited back
  [new RegExp(String.raw`\b(?:original payment method|credited (?:to|back to)[^:\n]{0,40})\s*:?\s*${MONEY}`, "i"), 0.85],
];

/** A refund notice: how much came back, and for which items ("Item: …", then "Quantity: 1"). */
function refundDetails(lines: string[], text: string) {
  let amount: Tracked<number> = missing();
  for (const [pattern, confidence] of REFUND_AMOUNT) {
    const m = text.match(pattern);
    const value = m ? Number(m[1].replace(/,/g, "")) : NaN;
    if (value > 0) {
      amount = extracted(value, confidence);
      break;
    }
  }
  const items: ExtractedLine[] = [];
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^(?:item|product)(?: name)?\s*:\s*(.{3,})$/i);
    if (!m) continue;
    const qty = lines[i + 1]?.match(/^(?:quantity|qty)\s*:?\s*(\d{1,3})\b/i);
    items.push({ name: extracted(m[1].trim(), 0.9), quantity: qty ? Number(qty[1]) : 1, price: missing() });
  }
  // One item refunded: the refund is its price.
  if (items.length === 1 && amount.value !== null) items[0].price = extracted(amount.value, 0.8);
  return { amount, items };
}

const label = (words: string) => new RegExp(`\\b(?:${words})\\b\\s*(?:no\\.?|number|#|id)?\\s*[:#-]?\\s*`, "i");

/** Personal mailboxes: mail from one was forwarded by a person, not sent by a shop. */
const PERSONAL_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|rediffmail|zoho)\./i;

function findMerchant(lines: string[], text: string, sender?: string | null) {
  // Several marketplaces can appear (a Myntra order's transport bill comes from
  // Flipkart): the one named most often is the seller, the earliest breaks ties.
  const mentions = (m: KnownMerchant) => {
    const all = [...text.matchAll(new RegExp(m.pattern.source, "gi"))];
    return { count: all.length, first: all[0]?.index ?? Infinity };
  };
  const known = MERCHANTS.map((m) => ({ m, ...mentions(m) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.first - b.first)[0]?.m;
  if (known) return { known, field: extracted(known.name, 0.95) };
  // An email forwarded by a Gmail filter may name the shop only in its sender ("auto-confirm@amazon.in").
  const byAddress = sender ? MERCHANTS.find((m) => m.pattern.test(sender)) : undefined;
  if (byAddress) return { known: byAddress, field: extracted(byAddress.name, 0.9) };

  for (const line of lines) {
    // "Sold By : Example Mobiles Pvt Ltd  Invoice Number : …": the name ends at the column gap.
    const m = line.match(/\b(?:sold by|seller|billed by|from)\s*[:-]\s*(\S.{2,59}?)(?:\s{2,}|$)/i);
    if (m) return { field: extracted(cleanName(m[1]), 0.75) };
  }
  // A shop's own email: its display name ("Example Shoes <orders@shoes.example>").
  const shopName = sender && !PERSONAL_MAIL.test(sender) ? sender.match(/^\s*"?([^"<]{2,60}?)"?\s*</)?.[1] : undefined;
  if (shopName && /[a-z]{2}/i.test(shopName)) return { field: extracted(cleanName(shopName), 0.7) };
  const first = lines.find((l) => /[a-z]{3}/i.test(l) && !/invoice|receipt|order|page \d/i.test(l) && !isTableHeader(l));
  return { field: first ? extracted(cleanName(first), 0.5) : missing<string>() };
}

const cleanName = (s: string) => s.replace(/\s{2,}.*/, "").replace(/[,.;:]+$/, "").trim();

/** A reference after a label like "Order No:" — has a digit and isn't a date. */
function labelledRef(lines: string[], words: string): string | null {
  const labelled = label(words);
  for (const [i, line] of lines.entries()) {
    const m = line.match(labelled);
    if (!m) continue;
    // "Your order ID", with the number on the line below.
    const rest = line.slice((m.index ?? 0) + m[0].length).trim() || (lines[i + 1] ?? "").trim();
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
  // The order date is when it was bought; an invoice can be dated a day later.
  for (const labelled of [
    /\b(order(ed)? (date|on)|date of (purchase|order|service)|purchase date|service date)\b/i,
    /\b(invoice date|date of invoice|bill date|dated?)\b/i,
  ]) {
    for (const line of lines) {
      if (!labelled.test(line)) continue;
      const date = parseDate(line.slice(line.search(labelled)));
      if (date) return extracted(date, 0.92);
    }
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

/** "Order # 407-1234567-1234567", possibly after an invisible direction mark. */
const ORDER_HEADING = /^order\s*#\s*:?\s*[\u200e\u200f\u202a-\u202e]*\s*([A-Z0-9][A-Z0-9-]{5,})/i;
const ORDER_TOTAL = /^(?:order\s+)?total\b(?!.*\b(?:sub ?total|tax|gst)\b)/i;

/**
 * One "Ordered" email can confirm several orders, each under its own "Order #"
 * heading and with its own "Total". Returns each block (from its heading to the
 * next) with that total, or null unless every one of two or more blocks has one.
 */
function orderBlocks(lines: string[]) {
  // A PDF of several invoices (goods, then a fee or transport bill) is one order: see findTotal.
  if (documentSections(lines).length > 1) return null;
  const heads = lines.flatMap((l, i) => (ORDER_HEADING.test(l) ? [i] : []));
  const refs = new Set(heads.map((i) => lines[i].match(ORDER_HEADING)![1]));
  if (heads.length < 2 || refs.size < 2) return null;
  const blocks = heads.map((start, n) => {
    const end = heads[n + 1] ?? lines.length;
    const at = lines.findIndex((l, i) => i > start && i < end && ORDER_TOTAL.test(l) && amountsIn(l).length > 0);
    return { start, end, total: at < 0 ? null : amountsIn(lines[at]).at(-1)! };
  });
  return blocks.every((b) => b.total !== null) ? (blocks as { start: number; end: number; total: number }[]) : null;
}

function findTotal(lines: string[]): Tracked<number> {
  // Several orders in one email: what was paid is the sum of their totals.
  const orders = orderBlocks(lines);
  if (orders) {
    const sum = Math.round(orders.reduce((s, o) => s + o.total, 0) * 100) / 100;
    return extracted(sum, 0.85);
  }
  // One PDF can hold several invoices for one order (e.g. the goods, then a
  // platform fee). What was paid is the sum of their totals; a bill of supply
  // for transport is reported separately (see parseDocument), not added.
  const sections = documentSections(lines);
  if (sections.length > 1) {
    const totals = sections
      .filter((s) => s.kind === "invoice")
      .map((s) => findTotal(lines.slice(s.start + 1, s.end)));
    if (totals.length && totals.every((t) => t.value !== null)) {
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

const RETURN_DEADLINE =
  /\b(?:return|replacement|exchange)s?\b[^.\n]{0,60}?\b(?:by|till|until|before|on or before|closes? on|ends? on|valid (?:till|until)|last date)\b/i;
const RETURN_PERIOD = /\b(\d{1,3})[\s-]*days?\b[^.\n]{0,25}\b(?:return|replacement|exchange)\b|\b(?:return|replacement|exchange)s?\b[^.\n]{0,30}\bwithin\s+(\d{1,3})\s*days?\b/i;

/** The last day to return: a stated date, or a return period counted from the order date. */
function findReturnBy(lines: string[], orderDate: string | null): Tracked<string> | undefined {
  for (const line of lines) {
    const m = line.match(RETURN_DEADLINE);
    if (!m) continue;
    const date = parseDate(line.slice((m.index ?? 0) + m[0].length));
    if (date && (!orderDate || date >= orderDate)) return extracted(date, 0.88);
  }
  if (!orderDate) return undefined;
  for (const line of lines) {
    const m = line.match(RETURN_PERIOD);
    const days = Number(m?.[1] ?? m?.[2]);
    if (days > 0 && days <= 365) {
      const d = new Date(`${orderDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return extracted(d.toISOString().slice(0, 10), 0.6);
    }
  }
  return undefined;
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
  /\b(sub ?total|total|tax|taxable|gst|cgst|sgst|igst|cess|discount|shipping|delivery|convenience|fees?|charges?|freight|transport(ation)?|handling|packing|round(ing)? off|amount in words|payment|paid|balance|invoice|order (no|number|id|date)|date|gstin|qty|quantity|description|unit price|saved|you save)\b|\b(pan|phone|mobile|e-?mail|address|rate)\s*(no\.?|number)?\s*[:#]|\bpage\s+\d/i;
// Labels like "PAN:", "Phone:", "Rate:" only count as labels: a "Non-stick Pan" or a
// "Heart Rate Monitor" is an item.
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
    .replace(/^[A-Z0-9]{6,}(?:\([^)]*\))?\s*[-–:]\s+/, "")
    .replace(/\s*[|(]?\s*\bHSN\b.*$/i, "")
    .replace(/\s*\|.*$/, "")
    .trim();

/** Where an address block starts: everything until the items table is address, not items. */
const ADDRESS_START =
  /\b(bill(ed)? (to|from)|ship(ped)? (to|from)|deliver(y|ed)? to|billing address|shipping address|delivery address|sold by|seller details|customer details|consignor|consignee|destination|place of origin|reg(istered)?\.? address)\b/i;
/** Registration numbers and invoice metadata, never items. */
const IDENTITY_LINE =
  /\b(pan|cin)\s*(no\.?|number)?\s*[:#]|\b(gstin|gst ?(no|number|reg)|fssai|state code|place of supply|customer type|nature of (transaction|supply)|packet ?id|e\.? ?& ?o\.? ?e)\b/i;
/** The items table's header: several column names on one line. */
const TABLE_HEADER_WORDS = /\b(qty|quantity|description|particulars|item|product|amount|total|rate|price|mrp|hsn|sac|value|gross|discount|taxable)\b/gi;
const isTableHeader = (line: string) => new Set(line.toLowerCase().match(TABLE_HEADER_WORDS) ?? []).size >= 2;
/** After these, the rest of the section is declarations and transport details, not items. */
const END_OF_ITEMS =
  /\b(details of goods transported|terms (&|and) conditions|declaration|authori[sz]ed signatory|amount in words)\b|^\s*(price (breakup|break-up|details)|bill details)\s*$/i;

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Explains totals of PDFs that hold several documents. */
function sectionNotes(lines: string[], items: ExtractedLine[]): { messages: string[]; explained: boolean } {
  const sections = documentSections(lines);
  if (sections.length < 2) return { messages: [], explained: false };
  const totalOf = (s: { start: number; end: number }) => findTotal(lines.slice(s.start + 1, s.end)).value;
  const invoices = sections.filter((s) => s.kind === "invoice").map(totalOf).filter((v): v is number => v !== null);
  const supplies = sections.filter((s) => s.kind === "supply").map(totalOf).filter((v): v is number => v !== null);
  const notes: string[] = [];
  const itemSum = items.reduce((s, l) => s + (l.price.value ?? 0), 0);
  // Items match the first invoice exactly: the others are fees charged alongside.
  const explained = invoices.length > 1 && Math.abs(itemSum - invoices[0]) <= 1;
  if (explained) {
    const extra = invoices.slice(1);
    notes.push(
      `The items come to ${rupees(invoices[0])}. The PDF also has ${extra.length === 1 ? "an invoice" : "invoices"} for ${extra.map(rupees).join(" + ")} (such as a platform fee), included in the total.`,
    );
  } else if (invoices.length > 1) {
    notes.push(`This PDF holds ${invoices.length} invoices (${invoices.map(rupees).join(" + ")}); the total adds them up.`);
  }
  for (const v of supplies) {
    notes.push(`It also has a bill of supply (${rupees(v)}, usually transport) that isn't added to the total. Add it if you paid it.`);
  }
  return { messages: notes, explained };
}

/**
 * A long product name wraps onto the next line ("… White T-" / "Shirts, Size: L",
 * "… Size: L" / "(7-8Y)"); anything else starts a new name.
 */
function continuePending(pending: { text: string; at: number } | null, raw: string, i: number) {
  const line = raw.trim();
  if (pending && i - pending.at === 1) {
    const prev = pending.text.trimEnd();
    if (/[-–/]$/.test(prev)) return { text: prev + line, at: i };
    // A brand on its own line ("Marks & Spencer"), then the product: one name.
    const brand = prev.split(/\s+/).length <= 4 && !/[\d:]/.test(prev);
    if (/[,&(]$/.test(prev) || /^[(a-z]/.test(line) || (line.length < 25 && !line.includes(":")) || (brand && !line.includes(":"))) {
      return { text: `${prev} ${line}`, at: i };
    }
  }
  return { text: line, at: i };
}

/** "Tax Invoice" and "Bill of Supply" sections when one PDF holds several documents. */
export function documentSections(lines: string[]) {
  const sections: { kind: "invoice" | "supply"; start: number; end: number }[] = [];
  for (const [i, line] of lines.entries()) {
    const kind = /^tax invoice\b/i.test(line) ? "invoice" : /^bill of supply\b/i.test(line) ? "supply" : null;
    if (!kind) continue;
    const last = sections.at(-1);
    if (last && last.kind === kind && i - last.start <= 2) continue; // "Bill of Supply" / "Bill of Supply Details"
    if (last) last.end = i;
    sections.push({ kind, start: i, end: lines.length });
  }
  return sections;
}

/**
 * Item rows with their line total (the amount paid for that line, which is
 * the last amount on the row). Numbered table rows are items even when they
 * mention tax; other lines are skipped if they look like totals or headers.
 */
/** Warranty and return terms printed with the items: never part of an item's name. */
const TERMS_LINE =
  /\bwarranty\b|\bguarantee\b|\bnon[- ]?returnable\b|\b(returns?|replacement|exchange)\b.{0,40}\b(days?|by|till|until|before|window|policy|eligible|within|closes?)\b/i;

/**
 * A product detail printed under its name in shop emails: "Colour: Core Black",
 * "Size UK 9", or a bare "Cloud White / Core Black / Gum" or "UK 9".
 */
const ITEM_DETAIL = new RegExp(
  [
    /^\s*(colou?r|size|style|variant|article( no\.?| number)?|fit|material|width)\s*[:\-]\s*\S/.source,
    /^\s*size\s+((uk|us|eu|in)\s*)?(\d{1,2}(\.5)?|xxs|xs|s|m|l|xl|xxl|xxxl|free size)\b/.source,
    // "Size 2Y | Qty 1", "Size 3-4Y": any short size followed by more details or nothing.
    /^\s*size\s+[a-z0-9./-]{1,10}\s*(\|.*)?$/.source,
    /^\s*(uk|us|eu)\s*\d{1,2}(\.5)?\s*$/.source,
    /^\s*[a-z]+( [a-z]+)*( \/ [a-z]+( [a-z]+)*)+\s*$/.source,
  ].join("|"),
  "i",
);
/** Words that label a price, so "Price: ₹7,999.00" is still a row of amounts only. */
const PRICE_WORDS = /\b(unit price|price|mrp|amount|you pay|each|inr|rs)\b\.?|\bx\b|[:×]/gi;

/**
 * The price paid on a row of amounts: usually the last (an invoice's net
 * amount). A shop email prints the price, then the crossed-out MRP, and often
 * "Saved ₹…" under it ("₹755.00 ₹1799.00"): there the first is what was paid,
 * unless the second is just the price times the quantity.
 */
function paidOf(prices: number[], quantity: number, row: string, next = "") {
  if (prices.length === 2 && prices[1] > prices[0]) {
    const [price, other] = prices;
    const lineTotal = Math.abs(price * quantity - other) < 1;
    const saving = /^\s*(you\s+)?sav(ed|e|ing)\b|\b\d{1,2}\s?%\s*off\b/i.test(next);
    // Just "₹755.00 ₹1799.00": no quantity, rate or tax columns, as an invoice row would have.
    const bare = /^\s*₹\s?[\d,]+(\.\d{1,2})?\s+₹\s?[\d,]+(\.\d{1,2})?\s*$/.test(row);
    if (!lineTotal && (saving || bare)) return price;
  }
  return prices.at(-1)!;
}

/** Items, and the line each one's description starts on (to find terms printed under it). */
function findLines(lines: string[]): { items: ExtractedLine[]; starts: number[] } {
  const items: ExtractedLine[] = [];
  const starts: number[] = [];
  // A name waiting for its amounts: some invoices print the name, then tax
  // codes, then a row of amounts ("1  Rs 1799.00 … Rs 755.00").
  let pending: { text: string; at: number; quantity?: number; last?: number } | null = null;
  // Still close enough to the name: details under it ("Colour:", "Size:") keep it close.
  const near = (i: number) => pending !== null && i - (pending.last ?? pending.at) <= MAX_ROW_GAP;
  // Address blocks run until the items table; a bill of supply (transport) and
  // the declarations after the items hold no items at all.
  let inAddress = false;
  let skipSection = false;
  // Where the last item ended: "Sold by" just after it is about that item, not an address.
  let lastItemAt = -10;

  for (const [i, raw] of lines.entries()) {
    if (/^(tax invoice|invoice|bill of supply)\b/i.test(raw)) {
      skipSection = /^bill of supply\b/i.test(raw);
      inAddress = false;
      pending = null;
      continue;
    }
    if (skipSection) continue;
    if (END_OF_ITEMS.test(raw)) {
      skipSection = true;
      pending = null;
      continue;
    }
    if (inAddress) {
      if (isTableHeader(raw)) inAddress = false;
      continue;
    }
    // "Sold by: Example Retail" right under an item's name (shop emails) is about that item.
    if (pending && near(i) && /^\s*sold by\b/i.test(raw)) {
      pending.last = i;
      continue;
    }
    if (!pending && i - lastItemAt <= 3 && /^\s*sold by\b/i.test(raw)) continue;
    // "Colour: Core Black", "Size: UK 9" under a name describe that item; they aren't its name.
    if (pending && near(i) && ITEM_DETAIL.test(raw) && moneyIn(raw).length === 0) {
      // "Size: UK 9 | Qty: 2"
      const qty = raw.match(/\b(?:qty|quantity)\s*[:.]?\s*(\d{1,3})\b/i);
      if (qty) pending.quantity = Number(qty[1]) || 1;
      pending.last = i;
      continue;
    }
    if (ADDRESS_START.test(raw)) {
      inAddress = !isTableHeader(raw);
      pending = null;
      continue;
    }
    if (IDENTITY_LINE.test(raw)) {
      pending = null;
      continue;
    }
    if (TAX_CODE_LINE.test(raw)) continue;
    // Shop emails: the name, then "Quantity: 1  ₹299.00".
    const qtyRow = raw.match(/^\s*(?:qty|quantity)\s*[:.]?\s*(\d{1,3})\b/i);
    if (qtyRow && pending && near(i)) {
      const price = moneyIn(raw).at(-1);
      const description = cleanDescription(pending.text);
      if (price !== undefined && /[a-z]{3}/i.test(description) && description.length <= 160) {
        items.push({ name: extracted(description, 0.8), quantity: Number(qtyRow[1]) || 1, price: extracted(price, 0.8) });
        starts.push(pending.at);
        pending = null;
        if (items.length >= 30) break;
        continue;
      }
      // "Quantity: 1" with the price on the next line.
      if (price === undefined) {
        pending.quantity = Number(qtyRow[1]) || 1;
        pending.last = i;
        continue;
      }
    }
    const tableRow = TABLE_ROW.test(raw);
    const prices = moneyIn(raw);
    // Only amounts, perhaps labelled: "₹ 7,999.00", "Price: ₹7,999.00", "INR 7,999.00".
    const amountsOnly = prices.length > 0 && !/[a-z]{3}/i.test(raw.replace(PRICE_WORDS, " "));
    if (!tableRow && !(amountsOnly && pending) && NOT_AN_ITEM.test(raw)) {
      pending = null;
      continue;
    }
    if (prices.length === 0) {
      if (!/[a-z]{3}/i.test(raw) && !/^\(.*\)$/.test(raw.trim())) continue;
      // "1 Year Manufacturer Warranty" under a name belongs to the item but isn't its name.
      if (TERMS_LINE.test(raw)) continue;
      pending = continuePending(pending, raw, i);
      continue;
    }

    if (amountsOnly) {
      // A row of amounts only: it belongs to the name just above, if there is one.
      if (pending && near(i)) {
        const description = cleanDescription(pending.text);
        const qty = raw.trim().match(/^(\d{1,3})(?:\.0+)?\s/);
        const quantity = pending.quantity ?? (Number(qty?.[1] ?? 1) || 1);
        if (/[a-z]{3}/i.test(description) && description.length <= 160) {
          items.push({
            name: extracted(description, 0.8),
            quantity,
            price: extracted(paidOf(prices, quantity, raw, lines[i + 1]), 0.8),
          });
          starts.push(pending.at);
          lastItemAt = i;
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
    starts.push(i);
    if (items.length >= 30) break;
  }
  return { items, starts };
}

/** Where the items table ends: totals and payment summary. */
const END_OF_TABLE =
  /^\s*total\b|\b(sub ?total|grand total|order total|total amount|invoice (total|value)|net amount|amount payable|total payable)\b/i;

/**
 * Warranty and return terms per item: what's printed between an item and the
 * next one (or the totals) is that item's; what's printed elsewhere (a footer)
 * is the order's, and applies to items that state nothing of their own.
 */
function itemTerms(lines: string[], items: ExtractedLine[], starts: number[], orderDate: string | null) {
  const owned = new Set<number>();
  items.forEach((item, k) => {
    let end = starts[k + 1] ?? lines.length;
    for (let j = starts[k] + 1; j < end; j++) {
      if (END_OF_TABLE.test(lines[j])) {
        end = j;
        break;
      }
    }
    const segment = lines.slice(starts[k], end);
    for (let j = starts[k]; j < end; j++) owned.add(j);
    const warranty = findWarranty(segment);
    if (warranty) {
      item.warrantyMonths = warranty.months;
      item.warrantyEvidence = warranty.evidence;
    }
    if (segment.some((l) => /\bnon[- ]?returnable\b|\bnot (eligible for )?returnable\b|\bno returns?\b/i.test(l))) {
      item.nonReturnable = true;
      return;
    }
    const returnBy = findReturnBy(segment, orderDate);
    if (returnBy) item.returnBy = returnBy;
  });
  // The rest of the document: terms that apply to the whole order.
  return lines.filter((_, j) => !owned.has(j));
}

// ── Putting it together ─────────────────────────────────────────────────

/**
 * Where a shop's email turns to advertising: other products, with prices, that
 * weren't bought. Nothing from there on is read.
 */
const MARKETING = new RegExp(
  "\\b(" +
    [
      "related to items you.?ve viewed", "recommended for you", "recommendations? for you", "recommended based on",
      "based on your (purchase|order|browsing|shopping)", "customers who (bought|viewed)", "customers also (bought|viewed)",
      "frequently bought together", "you (may|might) also like", "you (may|might) like", "inspired by your", "top picks",
      "picked for you", "deals (for|recommended for|related to) you", "deals related to", "buy it again",
      "continue shopping", "keep shopping", "sponsored( products)?", "more items to (consider|explore)",
      "similar (items|products|deals)", "people also (bought|viewed)", "products related to", "more like this",
      "trending (now|deals)", "explore more", "saved items", "(related|more|top|today.?s|best) deals",
    ].join("|") +
    ")\\b",
  "i",
);

/**
 * "₹299" with its paise raised ("⁰⁰") reads as "₹29900". An item can't cost
 * more than the whole order, so a price that only fits once read as paise is.
 */
function raisedPaise(
  items: ExtractedLine[],
  total: ExtractedFields["total"],
  /** Where each item starts, and the orders an email lists: an item can't cost more than its own order. */
  context?: { starts: number[]; orders: ReturnType<typeof orderBlocks> },
) {
  for (const [n, l] of items.entries()) {
    const at = context?.starts[n];
    const own = at === undefined ? undefined : context?.orders?.find((o) => at >= o.start && at < o.end);
    const limit = own?.total ?? total?.value;
    if (!limit) continue;
    const p = l.price.value;
    if (p !== null && Number.isInteger(p) && p >= 1000 && p * l.quantity > limit && (p / 100) * l.quantity <= limit) {
      l.price = extracted(p / 100, Math.min(l.price.confidence ?? 0.8, 0.75));
    }
  }
}

/**
 * Urban Company's booking PDF: the platform's tax invoice for its convenience and
 * platform fee, then the service partner's receipt for the work. Each lists
 * "<item>  Gross Amount  INR x" (the name may wrap onto the next line) and ends
 * with "Subtotal  INR x"; together the subtotals are what was paid.
 */
function urbanCompanyBooking(lines: string[]) {
  const sections: { rows: { name: string; amount: number }[]; subtotal: number | null }[] = [];
  const amount = String.raw`(?:inr|₹|rs\.?)\s*([\d,]+(?:\.\d{1,2})?)`;
  for (const [i, line] of lines.entries()) {
    if (/^(tax invoice|receipt)\b/i.test(line) || sections.length === 0) sections.push({ rows: [], subtotal: null });
    const section = sections[sections.length - 1];
    const row = line.match(new RegExp(String.raw`^(.+?)\s{2,}gross amount\s{2,}${amount}\s*$`, "i"));
    if (row) {
      const next = lines[i + 1] ?? "";
      const wrapped = /[a-z]{3}/i.test(next) && moneyIn(next).length === 0 && !/^(sac|hsn|discount|taxable|subtotal)\b/i.test(next);
      section.rows.push({ name: `${row[1]}${wrapped ? ` ${next}` : ""}`.trim(), amount: Number(row[2].replace(/,/g, "")) });
    }
    const subtotal = line.match(new RegExp(String.raw`^(?:sub ?total|total amount)\s{2,}${amount}\s*$`, "i"));
    if (subtotal) section.subtotal = Number(subtotal[1].replace(/,/g, ""));
  }
  const billed = sections.filter((s) => s.rows.length && s.subtotal !== null);
  if (!billed.length) return null;

  const isFee = (name: string) => /\b(convenience|platform|booking) fee/i.test(name);
  const isWork = (name: string) => /\b(service|visit|labou?r|repair|installation|inspection|cleaning|uninstallation)\b/i.test(name);
  // One line per thing paid for: the work, the platform's fee, any parts.
  const bill: ExtractedLine[] = [];
  const line = (name: string, price: number, kind: ServiceLineKind): ExtractedLine => ({
    name: extracted(name, 0.85),
    quantity: 1,
    price: extracted(price, 0.85),
    kind,
  });
  let labour = 0;
  let fees = 0;
  let work: string | null = null;
  for (const s of billed) {
    const rows = s.rows.filter((r) => !isFee(r.name));
    if (rows.length === 0) {
      // A fee's row is before tax; its subtotal is what was charged for it.
      fees += s.subtotal!;
      bill.push(line(s.rows.map((r) => r.name).join(", "), s.subtotal!, "fee"));
    }
    for (const r of rows) {
      if (isWork(r.name)) {
        labour += r.amount;
        // "Service Charge - Chimney" → "Chimney service": what was serviced, for finding the item.
        const thing = r.name.match(/\s-\s*([^-]+)$/)?.[1].trim();
        work ??= thing ? (/\bservice\b/i.test(thing) ? thing : `${thing} service`) : r.name;
        bill.push(line(r.name, r.amount, "service"));
      } else {
        bill.push(line(r.name, r.amount, "part"));
      }
    }
  }
  const total = Math.round(billed.reduce((sum, s) => sum + s.subtotal!, 0) * 100) / 100;
  return { total, labour, fees, work, bill };
}

/** "-38% ₹93.00": a discounted product advertised after the order. */
const DEAL_BADGE = /^-\s?\d{1,2}\s?%\s*(₹|rs\.?|inr)\s?\d/i;

export function parseDocument(
  lines: string[],
  options: {
    /** When an email was sent (YYYY-MM-DD): its order date when the text gives none. */
    sentOn?: string | null;
    /** An email's From header: the shop, when the text doesn't name it. */
    sender?: string | null;
  } = {},
): ParseOutcome {
  const all = lines.map((l) => l.trim()).filter(Boolean);
  // Shops' advertising follows the order: a short heading like "Keep shopping for…",
  // once something has been priced (a "Buy it again" link in the top menu isn't it).
  const firstPrice = all.findIndex((l) => moneyIn(l).length > 0);
  // Advertised products also show a discount badge ("-38% ₹93.00"); an order's own items don't.
  const adsAt =
    firstPrice < 0
      ? -1
      : all.findIndex((l, i) => i > firstPrice && ((l.length <= 80 && MARKETING.test(l)) || DEAL_BADGE.test(l)));
  const clean = adsAt > 0 ? all.slice(0, adsAt) : all;
  const text = clean.join("\n");
  if (text.replace(/\s/g, "").length < 20) return { ok: false, reason: "no_text" };

  const { known, field: merchant } = findMerchant(clean, text, options.sender);
  const documentKind = classify(text, known);
  let date = findDate(clean);
  // Order emails often say only "Arriving today"; they were sent when the order was placed.
  if (date.state === "missing" && options.sentOn) date = extracted(options.sentOn, 0.7);

  if (documentKind === "refund_notice") {
    // Applied to a purchase you already have (see read-import), never saved as a new one.
    const refund = refundDetails(clean, text);
    const fields: ExtractedFields = { merchant, date, total: refund.amount, ...findRefs(clean, text, known) };
    const reviewReasons: string[] = [];
    if (refund.amount.value === null) reviewReasons.push("No refund amount found.");
    if (fields.orderRef?.value === null) reviewReasons.push("No order number found: choose the purchase it's for.");
    return {
      ok: true,
      extraction: {
        documentKind,
        parser: known ? `${known.id}@v1` : "generic@v1",
        fields,
        lines: refund.items,
        parts: [],
        reviewReasons,
      },
    };
  }
  const total = findTotal(clean);
  if (documentKind === "other" && (date.value === null || total.state === "missing")) {
    return { ok: false, reason: "not_a_receipt" };
  }

  const { items: found, starts } = findLines(clean);
  const fields: ExtractedFields = { date, total };
  let lineItems: ExtractedLine[] = [];
  let parts: ExtractedLine[] = [];

  const booking = known?.id === "urban-company" ? urbanCompanyBooking(clean) : null;
  if (booking) {
    // The platform's invoice (its fee) and the partner's receipt (the work) are one booking.
    fields.provider = merchant;
    fields.total = extracted(booking.total, 0.9);
    if (booking.labour) fields.labourCost = extracted(booking.labour, 0.9);
    fields.workPerformed = booking.work ? extracted(booking.work, 0.85) : missing();
    parts = booking.bill;
  } else if (documentKind === "service_receipt") {
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
    const orderLevel = itemTerms(clean, lineItems, starts, date.value);
    const returnBy = findReturnBy(orderLevel, date.value);
    if (returnBy) fields.returnBy = returnBy;
    const warranty = findWarranty(orderLevel);
    if (warranty) {
      fields.warrantyMonths = warranty.months;
      fields.warrantyEvidence = warranty.evidence;
    }
  }

  raisedPaise(lineItems, fields.total, { starts, orders: orderBlocks(clean) });
  corroborate(fields, documentKind === "service_receipt" ? parts : lineItems);
  const notes = sectionNotes(clean, lineItems);
  if (notes.explained && fields.total) {
    // Items that add up exactly to the first invoice vouch for its total and for themselves.
    fields.total.confidence = Math.max(fields.total.confidence ?? 0, 0.95);
    for (const l of lineItems) if (l.price.state === "extracted") l.price.confidence = Math.max(l.price.confidence ?? 0, 0.95);
  }
  const reviewReasons = validate(documentKind, fields, lineItems, parts);
  if (notes.explained) {
    // The difference is the other invoices in the PDF (a platform fee), not a misread price.
    const i = reviewReasons.findIndex((r) => r.startsWith("Items don't add up"));
    if (i >= 0) reviewReasons.splice(i, 1);
  }
  reviewReasons.push(...notes.messages);
  if (booking?.fees) {
    // The rest of the total is the platform's fee, not a misread price.
    const i = reviewReasons.findIndex((r) => r.startsWith("Items don't add up"));
    if (i >= 0) reviewReasons.splice(i, 1);
    reviewReasons.push(`The total includes Urban Company's fees of ₹${booking.fees.toLocaleString("en-IN")} (with tax).`);
  }
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

/**
 * Combines what several documents of one purchase say (a forwarded email and
 * its attached invoice): the most complete one leads, the others fill in
 * fields it lacks, and a value two documents agree on is more certain.
 */
export function mergeExtractions(primary: Extraction, others: Extraction[]): Extraction {
  if (others.length === 0) return primary;
  const fields: ExtractedFields = { ...primary.fields };
  const keys = Object.keys as <T extends object>(o: T) => (keyof T)[];
  let filled = false;

  for (const other of others) {
    for (const key of keys(other.fields)) {
      const theirs = other.fields[key] as Tracked<string | number> | undefined;
      const ours = fields[key] as Tracked<string | number> | undefined;
      if (!theirs || theirs.value === null) continue;
      if (!ours || ours.value === null) {
        (fields as Record<string, unknown>)[key] = theirs;
        filled = true;
      } else if (ours.state === "extracted" && String(ours.value).toLowerCase() === String(theirs.value).toLowerCase()) {
        (fields as Record<string, unknown>)[key] = { ...ours, confidence: Math.max(ours.confidence ?? 0, 0.95) };
      }
    }
  }

  const lines = primary.lines.length ? primary.lines : (others.find((o) => o.lines.length)?.lines ?? []);
  const parts = primary.parts.length ? primary.parts : (others.find((o) => o.parts.length)?.parts ?? []);
  const isService = primary.documentKind === "service_receipt";
  corroborate(fields, isService ? parts : lines);
  const reviewReasons = validate(primary.documentKind, fields, lines, parts);
  // Notes about the lead document's own layout (several invoices in one PDF) still apply.
  const layoutNotes = primary.reviewReasons.filter((r) => /^(The items come to|This PDF holds|It also has a bill of supply)/.test(r));
  if (layoutNotes.some((r) => r.startsWith("The items come to"))) {
    const i = reviewReasons.findIndex((r) => r.startsWith("Items don't add up"));
    if (i >= 0) reviewReasons.splice(i, 1);
  }
  reviewReasons.push(...layoutNotes);
  if (filled) reviewReasons.push("Some details were filled in from the email around the attachment.");
  return { ...primary, fields, lines, parts, reviewReasons };
}

/** Items that add up exactly to the total vouch for each other's amounts. */
/**
 * The amounts a bill's rows account for. A full breakdown (lines marked service,
 * fee or part) already includes the work; otherwise labour is listed apart from parts.
 */
function billAmounts(fields: ExtractedFields, rows: ExtractedLine[]) {
  const prices = rows.map((l) => l.price.value);
  return rows.some((l) => l.kind) || !fields.labourCost ? prices : [...prices, fields.labourCost.value];
}

function corroborate(fields: ExtractedFields, rows: ExtractedLine[]) {
  const total = fields.total;
  if (!total?.value || rows.length === 0) return;
  const sum = billAmounts(fields, rows).reduce<number>((s, p) => s + (p ?? 0), 0);
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

  // Line prices are line totals, so they add up without multiplying by quantity. A small
  // difference is taxes, delivery or a discount (shown as its own line); a big one is
  // more likely a misread price.
  const prices = billAmounts(fields, rows);
  if (rows.length && otherCharges(fields.total?.value, prices)?.suspicious) {
    reasons.push("Items don't add up to the total. Check for shipping, fees, discounts or a misread price.");
  }

  const fieldList = [...Object.values(fields), ...rows.flatMap((l) => [l.name, l.price])];
  if (fieldList.some((f) => f && f.state === "extracted" && (f.confidence ?? 1) < 0.8)) {
    reasons.push("Some values were hard to read. Check the highlighted fields.");
  }
  return reasons;
}
