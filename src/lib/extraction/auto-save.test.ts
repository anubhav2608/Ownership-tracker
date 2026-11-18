import { describe, expect, it } from "vitest";
import { sampleInvoiceEml, CAR } from "@/lib/demo/sample-data";
import { bodyLines, parseRawEmail } from "./email";
import { parseDocument, type Extraction } from "./parse";
import { AUTO_SAVE_ACCURACY, purchaseAutoSave, readingAccuracy, serviceAutoSave } from "./auto-save";

async function sampleOutcome(candidates: { item_id: string; score: number }[], tweak?: (x: Extraction) => void) {
  const email = await parseRawEmail(new TextEncoder().encode(sampleInvoiceEml()));
  const parsed = parseDocument(bodyLines(email), { sender: email.fromHeader });
  if (!parsed.ok) throw new Error("not read");
  const x = parsed.extraction;
  tweak?.(x);
  return {
    status: "needs_review",
    document_kind: x.documentKind,
    extracted: { fields: x.fields, lines: x.lines, parts: x.parts },
    review_reasons: x.reviewReasons,
    candidates,
  } as never;
}

describe("saving a service invoice without a check", () => {
  it("saves one that's read accurately and matched to one car", async () => {
    const r = serviceAutoSave(await sampleOutcome([{ item_id: "car", score: 0.97 }]));
    expect(r).not.toBeNull();
    expect(r!.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(r!.event).toMatchObject({ item_id: "car", total_cost: 4900, odometer_km: 24310, labour_cost: 900 });
    expect(CAR.name).toBeTruthy();
  });

  it("saves one that matches none of the user's items on its own", async () => {
    const r = serviceAutoSave(await sampleOutcome([]));
    expect(r?.event).toMatchObject({ item_id: null, total_cost: 4900 });
  });

  it("never attaches on a guess", async () => {
    expect(serviceAutoSave(await sampleOutcome([{ item_id: "car", score: 0.6 }]))).toBeNull();
    expect(
      serviceAutoSave(await sampleOutcome([{ item_id: "a", score: 0.95 }, { item_id: "b", score: 0.9 }])),
    ).toBeNull();
  });

  it("auto-saves above 60% accuracy", () => {
    expect(AUTO_SAVE_ACCURACY).toBe(0.6);
  });

  it("waits for review at 60% accuracy or less", async () => {
    const low = await sampleOutcome([{ item_id: "car", score: 0.97 }], (x) => {
      for (const t of [x.fields.date, x.fields.total, x.fields.provider, x.fields.workPerformed]) if (t) t.confidence = 0.4;
      for (const p of x.parts) p.price.confidence = 0.4;
    });
    expect(serviceAutoSave(low)).toBeNull();
  });

  it("waits when the reader flagged something", async () => {
    const flagged = await sampleOutcome([{ item_id: "car", score: 0.97 }], (x) => x.reviewReasons.push("Check the total."));
    expect(serviceAutoSave(flagged)).toBeNull();
  });

  it("measures accuracy as the average confidence of what was read", () => {
    const t = (c: number) => ({ value: "x", state: "extracted" as const, confidence: c });
    expect(readingAccuracy({ a: t(1), b: t(0.5), c: { value: null, state: "missing" } })).toBeCloseTo(0.75);
    expect(readingAccuracy({})).toBeNull();
  });
});

const t = <T,>(value: T, confidence = 0.95) => ({ value, state: "extracted" as const, confidence });
const line = (name: string, price: number, confidence = 0.95) => ({ name: t(name, confidence), quantity: 1, price: t(price, confidence) });

function purchaseOutcome(over: { confidence?: number; reasons?: string[]; kind?: string; orders?: unknown; lines?: unknown[] } = {}) {
  const c = over.confidence ?? 0.95;
  return {
    status: "needs_review",
    document_kind: over.kind ?? "order_confirmation",
    review_reasons: over.reasons ?? [],
    extracted: {
      fields: {
        merchant: t("Croma", c),
        date: t("2026-11-01", c),
        orderRef: t("CR-1001", c),
        total: t(52990, c),
        returnBy: t("2026-11-08", c),
        warrantyMonths: t(12, c),
        warrantyEvidence: t("1 year manufacturer warranty", c),
      },
      lines: over.lines ?? [line("Samsung 55 inch QLED TV", 52990, c)],
      ...(over.orders ? { orders: over.orders } : {}),
    },
  } as never;
}

describe("saving a purchase without a check", () => {
  it("saves an order read above 60%, as the review screen would", () => {
    const r = purchaseAutoSave(purchaseOutcome());
    expect(r).not.toBeNull();
    const [p] = r!.purchases as unknown as Record<string, unknown>[];
    expect(p).toMatchObject({ merchant: "Croma", order_date: "2026-11-01", order_ref: "CR-1001", total: 52990 });
    expect((p.items as Record<string, unknown>[])[0]).toMatchObject({
      name: "Samsung 55 inch QLED TV",
      price: 52990,
      return_by: "2026-11-08",
      warranty: { months: 12, state: "extracted", evidence: "1 year manufacturer warranty" },
    });
  });

  it("saves at 61% but not at 60%", () => {
    expect(purchaseAutoSave(purchaseOutcome({ confidence: 0.61 }))).not.toBeNull();
    expect(purchaseAutoSave(purchaseOutcome({ confidence: 0.6 }))).toBeNull();
  });

  it("isn't held back by notes that are only information", () => {
    const reasons = ["Some values were hard to read. Check the highlighted fields.", "Some details were filled in from the email around the attachment."];
    expect(purchaseAutoSave(purchaseOutcome({ reasons, confidence: 0.7 }))).not.toBeNull();
  });

  it("waits when something needs a person", () => {
    for (const reason of [
      "You already have this purchase from Croma (same order number). Saving will ask whether to replace it.",
      "Items don't add up to the total. Check for shipping, fees, discounts or a misread price.",
      "This is a shipping update. If you have the order confirmation, forward that instead: it has more detail.",
    ]) {
      expect(purchaseAutoSave(purchaseOutcome({ reasons: [reason] }))).toBeNull();
    }
    expect(purchaseAutoSave(purchaseOutcome({ lines: [] }))).toBeNull();
    expect(purchaseAutoSave(purchaseOutcome({ kind: "refund_notice" }))).toBeNull();
  });

  it("saves an email with several orders as one purchase each", () => {
    const r = purchaseAutoSave(
      purchaseOutcome({
        lines: [line("Shirt", 999), line("Shoes", 2999)],
        orders: [
          { ref: "A-1", total: 999, items: [0] },
          { ref: "A-2", total: 2999, items: [1] },
        ],
      }),
    );
    const ps = r!.purchases as unknown as { order_ref: string; items: { name: string }[] }[];
    expect(ps.map((p) => [p.order_ref, p.items.map((i) => i.name)])).toEqual([["A-1", ["Shirt"]], ["A-2", ["Shoes"]]]);
  });

  it("leaves out a warranty with no words for it on the document", () => {
    const o = purchaseOutcome() as unknown as { extracted: { fields: Record<string, unknown> } };
    delete o.extracted.fields.warrantyEvidence;
    const [p] = purchaseAutoSave(o as never)!.purchases as unknown as { items: { warranty: unknown }[] }[];
    expect(p.items[0].warranty).toBeNull();
  });
});
