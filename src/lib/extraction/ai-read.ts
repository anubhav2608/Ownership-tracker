import { z } from "zod";
import { otherCharges } from "@/lib/charges";
import type { DocumentKind, ExtractedLine, ServiceLineKind, Tracked } from "@/lib/types";
import type { Extraction, ExtractedFields } from "./parse";

// Reading photos, scans and PDFs with Claude: what the document says, in the
// same shape as the template reader's, so the review screen works the same.
// The user still checks everything before it's saved; values the model wasn't
// sure of are highlighted.

export const AI_MODEL = "claude-opus-5-5";
/** Images Claude reads directly. HEIC (iPhone) photos aren't among them. */
export const AI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const nullable = <T extends z.ZodType>(t: T) => t.nullable();
const day = () => nullable(z.string().describe("YYYY-MM-DD"));

/** What the model returns: every field present, null when the document doesn't say. */
export const AiDocument = z.object({
  is_receipt: z.boolean().describe("False for adverts, newsletters, or anything that records no purchase, service or refund."),
  kind: z.enum(["order_confirmation", "invoice", "refund_notice", "service_receipt", "other"]),
  outcome: nullable(z.enum(["returned", "cancelled"])).describe("For a refund, return or cancellation notice only."),
  merchant: nullable(z.string()).describe("The shop or marketplace (Amazon, Flipkart, Croma…), or the service provider."),
  order_ref: nullable(z.string()),
  invoice_ref: nullable(z.string()),
  date: day().describe("Order, invoice or service date. Indian documents write dates day first."),
  total: nullable(z.number()).describe("Amount paid in rupees; for a refund or cancellation, the money back."),
  return_by: day(),
  warranty_months: nullable(z.number().int()).describe(
    "Only a warranty the document states for the whole order. A warranty for one item goes on that item, not here.",
  ),
  warranty_evidence: nullable(z.string()).describe("The document's own words stating that whole-order warranty."),
  work_performed: nullable(z.string()).describe("For a service bill: the work done."),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int(),
      price: nullable(z.number()).describe("What was paid for this line: quantity times unit price, including its tax, after discounts."),
      kind: nullable(z.enum(["service", "part", "fee"])).describe("Service bills only: the work, a part, or a fee."),
      warranty_months: nullable(z.number().int()),
      return_by: day(),
    }),
  ),
  unsure: z
    .array(z.string())
    .describe('Fields you could not read clearly or had to guess: "merchant", "date", "total", "order_ref", or "item N price" / "item N name" (N from 1).'),
});
export type AiDocument = z.infer<typeof AiDocument>;

export const SYSTEM = `You read Indian shopping and service documents (order emails, tax invoices, bills, refund and cancellation notices, service receipts) and return exactly what they state.

- Amounts are in rupees. Read "₹1,29900" or "29900" with raised paise as ₹1,299.00 / ₹299.00 when the layout shows the last two digits as paise.
- Item price is what was paid for that line, after discounts and including its tax. Ignore crossed-out MRPs, "You saved" lines, recommended products and adverts.
- One document can hold several invoices (goods, then a platform or delivery fee): list every item, and the total is all of them together. A bill of supply for transport is not an item.
- Never invent a value. Use null when the document doesn't state it, and list in "unsure" anything you read with doubt (blurred, cut off, handwritten).`;

export interface AiInput {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/** Reads one file with Claude; null when it can't (not a type Claude reads, too large, declined). */
export type AiReader = (file: AiInput) => Promise<AiDocument | null>;

export function canReadWithAi(mime: string, size: number) {
  if (mime === "application/pdf") return true;
  return (AI_IMAGE_TYPES as readonly string[]).includes(mime) && size <= MAX_IMAGE_BYTES;
}

const UNSURE = 0.6;
const SURE = 0.9;
const tracked = <T,>(value: T | null, unsure: boolean): Tracked<T> =>
  value === null || value === undefined || value === ""
    ? { value: null, state: "missing" }
    : { value, state: "extracted", confidence: unsure ? UNSURE : SURE };

/** Claude's reading in the template reader's shape (parser "llm": the review screen labels it). */
export function aiExtraction(doc: AiDocument): Extraction | null {
  if (!doc.is_receipt) return null;
  const unsure = new Set(doc.unsure.map((u) => u.toLowerCase().trim()));
  const isUnsure = (field: string) => unsure.has(field);
  const service = doc.kind === "service_receipt";

  const fields: ExtractedFields = {
    date: tracked(doc.date, isUnsure("date")),
    total: tracked(doc.total, isUnsure("total")),
    ...(service
      ? {
          provider: tracked(doc.merchant, isUnsure("merchant")),
          workPerformed: tracked(doc.work_performed ?? doc.items[0]?.name ?? null, isUnsure("work_performed")),
        }
      : {
          merchant: tracked(doc.merchant, isUnsure("merchant")),
          orderRef: tracked(doc.order_ref, isUnsure("order_ref")),
          invoiceRef: tracked(doc.invoice_ref, isUnsure("invoice_ref")),
        }),
  };
  if (doc.return_by) fields.returnBy = tracked(doc.return_by, isUnsure("return_by"));
  if (doc.warranty_months) {
    fields.warrantyMonths = tracked(doc.warranty_months, isUnsure("warranty_months"));
    if (doc.warranty_evidence) fields.warrantyEvidence = tracked(doc.warranty_evidence, false);
  }
  if (doc.kind === "refund_notice") fields.outcome = tracked(doc.outcome ?? "returned", isUnsure("outcome"));

  const lines: ExtractedLine[] = doc.items.map((item, i) => ({
    name: tracked(item.name, isUnsure(`item ${i + 1} name`)),
    quantity: item.quantity > 0 ? item.quantity : 1,
    price: tracked(item.price, isUnsure(`item ${i + 1} price`)),
    ...(item.kind ? { kind: item.kind as ServiceLineKind } : {}),
    ...(item.warranty_months ? { warrantyMonths: tracked(item.warranty_months, false) } : {}),
    ...(item.return_by ? { returnBy: tracked(item.return_by, false) } : {}),
  }));

  const reviewReasons: string[] = [];
  if (!service && doc.kind !== "refund_notice" && doc.total !== null && lines.length) {
    const charges = otherCharges(doc.total, lines.map((l) => l.price.value ?? 0));
    if (charges?.suspicious) {
      reviewReasons.push("Items don't add up to the total. Check for shipping, fees, discounts or a misread price.");
    }
  }
  if (unsure.size) reviewReasons.push("Some values were hard to read. Check the highlighted fields.");

  return {
    documentKind: (doc.kind === "other" ? "invoice" : doc.kind) as DocumentKind,
    parser: "llm",
    fields,
    lines: service ? [] : lines,
    parts: service ? lines : [],
    reviewReasons,
  };
}

const sameText = (a: unknown, b: unknown) =>
  String(a).toLowerCase().replace(/[^a-z0-9]/g, "") === String(b).toLowerCase().replace(/[^a-z0-9]/g, "");
const sameAmount = (a: unknown, b: unknown) => Math.abs(Number(a) - Number(b)) < 0.01;

/**
 * Claude's reading of a text PDF checked against the template reader's: where
 * both read the same value it's more certain; where they differ, Claude's is
 * kept but highlighted, with a note saying what the other read.
 */
export function crossCheck(ai: Extraction, rules: Extraction | null): Extraction {
  if (!rules) return ai;
  const out: Extraction = { ...ai, fields: { ...ai.fields }, reviewReasons: [...ai.reviewReasons] };
  const keys: [keyof ExtractedFields, string, (a: unknown, b: unknown) => boolean][] = [
    ["merchant", "shop", sameText],
    ["orderRef", "order number", sameText],
    ["date", "date", (a, b) => a === b],
    ["total", "total", sameAmount],
  ];
  for (const [key, label, same] of keys) {
    const a = out.fields[key] as Tracked<unknown> | undefined;
    const r = rules.fields[key] as Tracked<unknown> | undefined;
    if (!a || a.value === null || !r || r.value === null) continue;
    if (same(a.value, r.value)) {
      out.fields[key] = { ...a, confidence: Math.max(a.confidence ?? 0, 0.97) } as never;
    } else {
      out.fields[key] = { ...a, confidence: Math.min(a.confidence ?? 1, UNSURE) } as never;
      out.reviewReasons.push(`Two readings of the ${label} differ (${String(a.value)} or ${String(r.value)}): check it.`);
    }
  }
  // Items priced the same by both readers are confirmed.
  const ruleItems = rules.lines.length ? rules.lines : rules.parts;
  const aiItems = out.lines.length ? out.lines : out.parts;
  if (ruleItems.length === aiItems.length) {
    const prices = (ls: ExtractedLine[]) => ls.map((l) => l.price.value ?? -1).sort((x, y) => x - y);
    const [p, q] = [prices(aiItems), prices(ruleItems)];
    if (p.every((v, i) => sameAmount(v, q[i]))) {
      for (const l of aiItems) if (l.price.state === "extracted") l.price.confidence = Math.max(l.price.confidence ?? 0, 0.97);
    }
  }
  if (out.reviewReasons.some((r) => r.startsWith("Two readings")) && !out.reviewReasons.includes("Some values were hard to read. Check the highlighted fields.")) {
    out.reviewReasons.push("Some values were hard to read. Check the highlighted fields.");
  }
  return out;
}
