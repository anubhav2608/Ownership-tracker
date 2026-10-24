import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseDocument } from "./parse";
import { extractPdfText } from "./pdf-text";

// End to end: build fictional PDFs with real text layers, extract them with
// pdfjs, and parse. Standard PDF fonts have no ₹ glyph, so amounts use "Rs.".

type Row = string | [x: number, text: string][];

async function makePdf(rows: Row[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 560;
  for (const row of rows) {
    const cells = typeof row === "string" ? [[40, row] as [number, string]] : row;
    for (const [x, text] of cells) page.drawText(text, { x, y, size: 9, font });
    y -= 18;
  }
  return doc.save();
}

async function scannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 40, y: 400, width: 500, height: 300, color: rgb(0.8, 0.8, 0.8) });
  return doc.save();
}

const table = (cells: string[], xs: number[]): Row => cells.map((c, i) => [xs[i], c] as [number, string]);
const COLS = [40, 60, 330, 420, 450, 530, 580, 630, 720];

describe("extractPdfText + parseDocument", () => {
  it("reads a tabular marketplace invoice", async () => {
    const pdf = await makePdf([
      "Tax Invoice/Bill of Supply/Cash Memo",
      [[40, "Sold By :"], [100, "Fictional Retail Private Limited"]],
      [[40, "Order Number: 408-1938842-1173903"], [420, "Invoice Number : BLR7-123456"]],
      [[40, "Order Date: 15.10.2026"], [420, "Invoice Date : 16.10.2026"]],
      table(["Sl. No", "Description", "Unit Price", "Qty", "Net Amount", "Tax Rate", "Tax Type", "Tax Amount", "Total Amount"], COLS),
      table(["1", "Sony WH-1000XM6 Wireless Headphones | HSN:8518", "Rs.25,415.25", "1", "Rs.25,415.25", "18%", "IGST", "Rs.4,574.75", "Rs.29,990.00"], COLS),
      table(["2", "Sony Headphone Carry Case | HSN:4202", "Rs.1,270.34", "1", "Rs.1,270.34", "18%", "IGST", "Rs.228.66", "Rs.1,499.00"], COLS),
      [[40, "TOTAL:"], [630, "Rs.4,803.41"], [720, "Rs.31,489.00"]],
      "Manufacturer warranty: 1 year from the date of purchase",
      "Thank you for shopping on Amazon.in",
    ]);

    const { lines, pageCount } = await extractPdfText(pdf);
    expect(pageCount).toBe(1);
    const outcome = parseDocument(lines);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const doc = outcome.extraction;

    expect(doc.fields.merchant?.value).toBe("Amazon");
    expect(doc.fields.orderRef?.value).toBe("408-1938842-1173903");
    expect(doc.fields.date?.value).toBe("2026-10-15");
    expect(doc.fields.total?.value).toBe(31489);
    expect(doc.lines.map((l) => [l.name.value, l.price.value])).toEqual([
      ["Sony WH-1000XM6 Wireless Headphones", 29990],
      ["Sony Headphone Carry Case", 1499],
    ]);
    expect(doc.fields.warrantyMonths?.value).toBe(12);
    expect(doc.reviewReasons).toEqual([]);
  });

  it("keeps a two-column shop bill's description and amount apart", async () => {
    const pdf = await makePdf([
      "Sharma Electronics",
      [[40, "Invoice No: SE/2026/0457"], [400, "Date: 03/09/2026"]],
      [[40, "Philips Mixer Grinder HL7756"], [400, "Rs. 4,299.00"]],
      [[40, "Extension board 4-way"], [400, "Rs. 499.00"]],
      [[40, "Grand Total"], [400, "Rs. 4,798.00"]],
    ]);
    const outcome = parseDocument((await extractPdfText(pdf)).lines);
    expect(outcome.ok && outcome.extraction.lines.map((l) => [l.name.value, l.price.value])).toEqual([
      ["Philips Mixer Grinder HL7756", 4299],
      ["Extension board 4-way", 499],
    ]);
  });

  it("finds no text in a scanned page", async () => {
    const { lines } = await extractPdfText(await scannedPdf());
    expect(lines).toEqual([]);
    expect(parseDocument(lines)).toEqual({ ok: false, reason: "no_text" });
  });

  it("rejects bytes that aren't a PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
