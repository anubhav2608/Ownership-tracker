import { describe, expect, it } from "vitest";
import { parseDocument, type Extraction } from "./parse";

// Fictional documents modelled on common Indian invoice layouts. Columns are
// separated by two spaces, as extractPdfText produces for table gaps.

function parse(lines: string[]): Extraction {
  const outcome = parseDocument(lines);
  if (!outcome.ok) throw new Error(`expected a parse, got ${outcome.reason}`);
  return outcome.extraction;
}

describe("marketplace tax invoice (Amazon-style)", () => {
  const doc = parse([
    "Tax Invoice/Bill of Supply/Cash Memo",
    "Sold By :  Fictional Retail Private Limited",
    "Order Number: 408-1938842-1173903  Invoice Number : BLR7-123456",
    "Order Date: 15.10.2026  Invoice Date : 16.10.2026",
    "Sl. No  Description  Unit Price  Qty  Net Amount  Tax Rate  Tax Type  Tax Amount  Total Amount",
    "1  Sony WH-1000XM6 Wireless Headphones | HSN:8518  ₹25,415.25  1  ₹25,415.25  18%  IGST  ₹4,574.75  ₹29,990.00",
    "2  Sony Headphone Carry Case | HSN:4202  ₹1,270.34  1  ₹1,270.34  18%  IGST  ₹228.66  ₹1,499.00",
    "TOTAL:  ₹4,803.41  ₹31,489.00",
    "Amount in Words: Thirty-one Thousand Four Hundred Eighty-nine only",
    "Manufacturer warranty: 1 year from the date of purchase",
    "Thank you for shopping on Amazon.in",
  ]);

  it("recognises the merchant and its order number format", () => {
    expect(doc.parser).toBe("amazon-in@v1");
    expect(doc.documentKind).toBe("invoice");
    expect(doc.fields.merchant).toMatchObject({ value: "Amazon", state: "extracted" });
    expect(doc.fields.orderRef?.value).toBe("408-1938842-1173903");
  });

  it("uses the labelled order date, not the invoice date", () => {
    expect(doc.fields.date?.value).toBe("2026-10-15");
  });

  it("takes the grand total from the TOTAL row", () => {
    expect(doc.fields.total?.value).toBe(31489);
  });

  it("reads numbered table rows even though they mention tax", () => {
    expect(doc.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Sony WH-1000XM6 Wireless Headphones", 1, 29990],
      ["Sony Headphone Carry Case", 1, 1499],
    ]);
  });

  it("captures the warranty with the text that supports it", () => {
    expect(doc.fields.warrantyMonths?.value).toBe(12);
    expect(doc.fields.warrantyEvidence?.value).toContain("Manufacturer warranty: 1 year");
  });

  it("needs no review reasons when everything adds up", () => {
    expect(doc.reviewReasons).toEqual([]);
  });
});

describe("marketplace invoice without row numbers (Flipkart-style)", () => {
  const doc = parse([
    "Tax Invoice",
    "Sold By: Fictional Mobiles Pvt Ltd,",
    "Order ID: OD431100928811000  Invoice Date: 10-02-2025",
    "Product  Title  Qty  Gross Amount  Discount  Taxable Value  IGST  Total",
    "Google Pixel 9 (Obsidian, 128 GB)  1  79999.00  -5000.00  63558.47  11440.53  74999.00",
    "Grand Total  ₹ 74999.00",
    "Flipkart Internet Private Limited",
  ]);

  it("reads the order id, date, item and total", () => {
    expect(doc.parser).toBe("flipkart@v1");
    expect(doc.fields.orderRef?.value).toBe("OD431100928811000");
    expect(doc.fields.date?.value).toBe("2025-02-10");
    // Labelled "Grand Total" (0.92), raised because the single item matches it.
    expect(doc.fields.total).toMatchObject({ value: 74999, confidence: 0.95 });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].name.value).toBe("Google Pixel 9 (Obsidian, 128 GB)");
    expect(doc.lines[0].price.value).toBe(74999);
  });
});

describe("local shop bill (unknown merchant)", () => {
  const doc = parse([
    "Sharma Electronics",
    "Shop 12, MG Road, Bengaluru",
    "Invoice No: SE/2026/0457  Date: 03/09/2026",
    "Item  Amount",
    "Philips Mixer Grinder HL7756  Rs. 4,299.00",
    "Extension board 4-way  Rs. 499.00",
    "Grand Total  Rs. 4,798.00",
    "2 years warranty on mixer grinder motor",
  ]);

  it("guesses the merchant from the letterhead with low confidence", () => {
    expect(doc.parser).toBe("generic@v1");
    expect(doc.fields.merchant?.value).toBe("Sharma Electronics");
    expect(doc.fields.merchant?.confidence).toBeLessThan(0.8);
    expect(doc.reviewReasons).toContain("Some values were hard to read. Check the highlighted fields.");
  });

  it("reads the labelled invoice number, date, items and total", () => {
    expect(doc.fields.orderRef?.value).toBe("SE/2026/0457");
    expect(doc.fields.date?.value).toBe("2026-09-03");
    expect(doc.fields.total?.value).toBe(4798);
    expect(doc.lines.map((l) => l.name.value)).toEqual(["Philips Mixer Grinder HL7756", "Extension board 4-way"]);
  });

  it("converts a warranty in years to months", () => {
    expect(doc.fields.warrantyMonths?.value).toBe(24);
  });
});

describe("service receipt (Urban Company-style)", () => {
  const doc = parse([
    "Urban Company",
    "Service Receipt",
    "Booking ID: UC-31877  Date: 19 Oct 2026",
    "AC Service (Split)  Rs. 799.00",
    "Drain pipe  Rs. 349.00",
    "Total Amount Paid  ₹1,148.00",
  ]);

  it("is classified as a service receipt from the provider", () => {
    expect(doc.documentKind).toBe("service_receipt");
    expect(doc.fields.provider?.value).toBe("Urban Company");
    expect(doc.fields.date?.value).toBe("2026-10-19");
    expect(doc.fields.total?.value).toBe(1148);
  });

  it("separates labour from parts", () => {
    expect(doc.fields.workPerformed?.value).toBe("AC Service (Split)");
    expect(doc.fields.labourCost?.value).toBe(799);
    expect(doc.parts.map((p) => [p.name.value, p.price.value])).toEqual([["Drain pipe", 349]]);
    expect(doc.lines).toEqual([]);
  });
});

describe("validation", () => {
  it("flags totals that don't match the items", () => {
    const doc = parse([
      "Croma",
      "Tax Invoice  Invoice No: CRM-91022-0007  Date: 01/10/2026",
      "1  Refrigerator 340 L  Rs. 42,000.00",
      "2  Voltage stabiliser  Rs. 2,500.00",
      "Grand Total  Rs. 45,000.00",
    ]);
    expect(doc.fields.merchant?.value).toBe("Croma");
    expect(doc.reviewReasons).toContain(
      "Items don't add up to the total. Check for shipping, fees, discounts or a misread price.",
    );
  });

  it("asks for items when none are found", () => {
    const doc = parse(["Reliance Digital", "Tax Invoice", "Invoice Date: 04/05/2024", "Grand Total  Rs. 41,990.00"]);
    expect(doc.lines).toEqual([]);
    expect(doc.reviewReasons).toContain("Couldn't find the items. Add them below.");
  });
});

describe("documents that aren't receipts", () => {
  it("reports no text for an empty or scanned page", () => {
    expect(parseDocument([])).toEqual({ ok: false, reason: "no_text" });
  });

  it("rejects promotions without a date and total", () => {
    expect(
      parseDocument(["Big Billion Days are here!", "Up to 80% off on electronics.", "Shop now and save more"]),
    ).toEqual({ ok: false, reason: "not_a_receipt" });
  });

  it("recognises refund notices", () => {
    const doc = parse([
      "Flipkart",
      "Refund processed for your order OD431100928811000",
      "Refund date: 24-02-2025",
      "Refund amount  ₹74,999.00",
    ]);
    expect(doc.documentKind).toBe("refund_notice");
  });
});
