import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiExtraction, crossCheck, type AiDocument, type AiReader } from "./ai-read";
import { extractFromFiles, type SourceFile } from "./extract-files";

// Fictional documents; the AI reader is a stand-in returning what Claude would.

const doc = (over: Partial<AiDocument> = {}): AiDocument => ({
  is_receipt: true,
  kind: "invoice",
  outcome: null,
  merchant: "Sharma Electronics",
  order_ref: null,
  invoice_ref: "SE/2026/0457",
  date: "2026-09-03",
  total: 4798,
  return_by: null,
  warranty_months: null,
  warranty_evidence: null,
  work_performed: null,
  items: [
    { name: "Philips Mixer Grinder HL7756", quantity: 1, price: 4299, kind: null, warranty_months: null, return_by: null },
    { name: "Extension board 4-way", quantity: 1, price: 499, kind: null, warranty_months: null, return_by: null },
  ],
  unsure: [],
  ...over,
});

const file = (name: string, mime: string, bytes: Uint8Array): SourceFile => ({ name, mime, size: bytes.byteLength, load: async () => bytes.slice() });
const fixture = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "evals/cases", name)));
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("AI reading", () => {
  it("turns Claude's reading into the review screen's, highlighting what it was unsure of", () => {
    const x = aiExtraction(doc({ unsure: ["total", "item 2 price"] }))!;
    expect(x.parser).toBe("llm");
    expect(x.fields.merchant).toEqual({ value: "Sharma Electronics", state: "extracted", confidence: 0.9 });
    expect(x.fields.total?.confidence).toBe(0.6);
    expect(x.lines.map((l) => l.price.confidence)).toEqual([0.9, 0.6]);
    expect(x.reviewReasons).toContain("Some values were hard to read. Check the highlighted fields.");
    expect(aiExtraction(doc({ is_receipt: false }))).toBeNull();
  });

  it("reads a service bill into its parts, and a cancellation with its outcome", () => {
    const bill = aiExtraction(doc({ kind: "service_receipt", merchant: "Example Services", work_performed: "AC service", items: [
      { name: "AC service", quantity: 1, price: 899, kind: "service", warranty_months: null, return_by: null },
      { name: "Visit fee", quantity: 1, price: 49, kind: "fee", warranty_months: null, return_by: null },
    ] }))!;
    expect([bill.fields.provider?.value, bill.fields.workPerformed?.value, bill.parts.map((p) => p.kind)]).toEqual(["Example Services", "AC service", ["service", "fee"]]);
    const cancel = aiExtraction(doc({ kind: "refund_notice", outcome: "cancelled", total: 499 }))!;
    expect(cancel.fields.outcome?.value).toBe("cancelled");
  });

  it("cross-checks a text PDF: agreement confirms, a disagreement is highlighted", () => {
    const ai = aiExtraction(doc())!;
    const same = crossCheck(ai, aiExtraction(doc())!);
    expect([same.fields.total?.confidence, same.lines[0].price.confidence]).toEqual([0.97, 0.97]);
    const differ = crossCheck(aiExtraction(doc())!, aiExtraction(doc({ total: 4789 }))!);
    expect(differ.fields.total?.confidence).toBe(0.6);
    expect(differ.reviewReasons).toContain("Two readings of the total differ (4798 or 4789): check it.");
  });

  it("reads photos and scanned PDFs with AI, and text PDFs both ways", async () => {
    const calls: string[] = [];
    const ai: AiReader = async (f) => (calls.push(`${f.name}:${f.bytes.byteLength > 100}`), doc());
    const fromPhoto = await extractFromFiles([file("bill.jpg", "image/jpeg", photo)], { ai });
    expect(fromPhoto.best?.extraction.lines.map((l) => l.price.value)).toEqual([4299, 499]);
    const fromScan = await extractFromFiles([file("scan.pdf", "application/pdf", fixture("scanned-receipt.pdf"))], { ai });
    expect(fromScan.best?.extraction.fields.total?.value).toBe(4798);
    // The text PDF is the same bill: both readers agree.
    const fromText = await extractFromFiles([file("bill.pdf", "application/pdf", fixture("shop-bill.pdf"))], { ai });
    expect(fromText.best?.extraction.fields.total?.confidence).toBe(0.97);
    // Each file reached the AI whole (the PDF reader mustn't consume it first).
    expect(calls).toEqual(["bill.jpg:false", "scan.pdf:true", "bill.pdf:true"]);
  });

  it("works as before without AI, and says what went wrong when it can't read a file", async () => {
    const broken: AiReader = async () => {
      throw new Error("overloaded");
    };
    const blind: AiReader = async () => null;
    const problems = async (f: SourceFile, ai?: AiReader) => [...(await extractFromFiles([f], { ai })).problems];
    const jpg = file("bill.jpg", "image/jpeg", photo);
    const scan = file("scan.pdf", "application/pdf", fixture("scanned-receipt.pdf"));
    expect([await problems(jpg), await problems(scan)]).toEqual([["OCR_NOT_AVAILABLE"], ["NO_TEXT_LAYER"]]);
    expect([await problems(jpg, blind), await problems(scan, blind)]).toEqual([["AI_UNREADABLE"], ["AI_UNREADABLE"]]);
    expect([await problems(jpg, broken), await problems(scan, broken)]).toEqual([["AI_FAILED"], ["AI_FAILED"]]);
    // A text PDF is still read by the template reader when the AI fails.
    for (const ai of [undefined, broken, blind]) {
      const x = (await extractFromFiles([file("bill.pdf", "application/pdf", fixture("shop-bill.pdf"))], { ai })).best?.extraction;
      expect([x?.parser, x?.fields.total?.value]).toEqual(["generic@v1", 4798]);
    }
  });
});
