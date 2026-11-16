import { describe, expect, it } from "vitest";
import { sampleInvoiceEml, CAR } from "@/lib/demo/sample-data";
import { bodyLines, parseRawEmail } from "./email";
import { parseDocument, type Extraction } from "./parse";
import { readingAccuracy, serviceAutoSave } from "./auto-save";

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

  it("never attaches on a guess", async () => {
    expect(serviceAutoSave(await sampleOutcome([]))).toBeNull();
    expect(serviceAutoSave(await sampleOutcome([{ item_id: "car", score: 0.6 }]))).toBeNull();
    expect(
      serviceAutoSave(await sampleOutcome([{ item_id: "a", score: 0.95 }, { item_id: "b", score: 0.9 }])),
    ).toBeNull();
  });

  it("waits for review below 80% accuracy", async () => {
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
