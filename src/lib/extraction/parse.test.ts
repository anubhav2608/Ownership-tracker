import { describe, expect, it } from "vitest";
import { mergeExtractions, parseDocument, type Extraction } from "./parse";
import { moneyIn } from "./values";
import { guessCategory } from "./category";
import { otherCharges } from "@/lib/charges";

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
    expect(doc.fields.invoiceRef?.value).toBe("SE/2026/0457");
    expect(doc.fields.orderRef?.state).toBe("missing");
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
  it("treats a small difference from the total as charges, and flags a big one", () => {
    const lines = [
      "Croma",
      "Tax Invoice  Invoice No: CRM-91022-0007  Date: 01/10/2026",
      "1  Refrigerator 340 L  Rs. 42,000.00",
      "2  Voltage stabiliser  Rs. 2,500.00",
      "Grand Total  Rs. 45,000.00",
    ];
    const reason = "Items don't add up to the total. Check for shipping, fees, discounts or a misread price.";
    const small = parse(lines);
    expect(small.fields.merchant?.value).toBe("Croma");
    expect(small.reviewReasons).not.toContain(reason);
    expect(otherCharges(small.fields.total?.value, small.lines.map((l) => l.price.value))).toEqual({
      amount: 500,
      label: "Taxes, delivery & other charges",
      suspicious: false,
    });
    const big = parse(lines.map((l) => l.replace("45,000.00", "90,000.00")));
    expect(big.reviewReasons).toContain(reason);
    const discounted = parse(lines.map((l) => l.replace("45,000.00", "43,000.00")));
    expect(otherCharges(discounted.fields.total?.value, discounted.lines.map((l) => l.price.value))?.label).toBe("Discounts");
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

describe("return-by dates", () => {
  const base = ["Order Confirmation", "Order Date: 15 Oct 2026", "1  Hoodie  Rs. 1,499.00", "Order Total: Rs. 1,499.00"];

  it("reads a stated return deadline for the order", () => {
    for (const line of [
      "Return window closes on 25 Oct 2026",
      "Eligible for return till 25/10/2026",
      "Easy returns: return by Oct 25, 2026",
    ]) {
      const outcome = parseDocument([...base, line]);
      expect(outcome.ok && outcome.extraction.fields.returnBy).toMatchObject({ value: "2026-10-25", state: "extracted" });
    }
  });

  it("counts a return period from the order date, with lower confidence", () => {
    const outcome = parseDocument([...base, "This order has a 10-day return policy"]);
    expect(outcome.ok && outcome.extraction.fields.returnBy).toMatchObject({ value: "2026-10-25", confidence: 0.6 });
  });

  it("finds none when the document doesn't say", () => {
    const outcome = parseDocument(base);
    expect(outcome.ok && outcome.extraction.fields.returnBy).toBeUndefined();
  });
});

describe("warranty and returns per item", () => {
  // Fictional: each item states its own terms under its name; the footer states one for the rest.
  const outcome = parseDocument([
    "Tax Invoice",
    "Order Number: 404-1111111-2222222  Order Date: 01 Oct 2026",
    "Sl. No  Description  Qty  Total Amount",
    "1  Example Phone X1 (128 GB)  1  Rs. 24,999.00",
    "1 Year Manufacturer Warranty for device and 6 months for in-box accessories",
    "Return window closes on 08 Oct 2026",
    "2  Example Silicone Case  1  Rs. 499.00",
    "Warranty: 6 months",
    "3  Example Screen Guard  1  Rs. 299.00",
    "Non-returnable",
    "Grand Total  Rs. 25,797.00",
    "All products carry a 10 day replacement policy unless stated otherwise.",
  ]);
  if (!outcome.ok) throw new Error("fixture should parse");
  const [phone, kase, guard] = outcome.extraction.lines;

  it("gives each item the terms printed under it", () => {
    expect(outcome.extraction.lines.map((l) => l.name.value)).toEqual([
      "Example Phone X1 (128 GB)",
      "Example Silicone Case",
      "Example Screen Guard",
    ]);
    expect(phone.warrantyMonths?.value).toBe(12);
    expect(phone.returnBy?.value).toBe("2026-10-08");
    expect(kase.warrantyMonths?.value).toBe(6);
    expect(kase.returnBy).toBeUndefined();
    expect(guard.warrantyMonths).toBeUndefined();
    expect(guard.nonReturnable).toBe(true);
  });

  it("reads the seller even when it shares a line with the invoice number", () => {
    const o = parseDocument([
      "Tax Invoice",
      "Sold By : Example Mobiles Private Limited  Invoice Number : EXM-2026-0042",
      "Order Date: 01 Oct 2026",
      "Sl. No  Description  Qty  Total Amount",
      "1  Example Phone X1  1  Rs. 24,999.00",
      "Grand Total  Rs. 24,999.00",
    ]);
    expect(o.ok && o.extraction.fields.merchant?.value).toBe("Example Mobiles Private Limited");
  });

  it("keeps the footer's terms for the whole order", () => {
    expect(outcome.extraction.fields.returnBy?.value).toBe("2026-10-11");
    expect(outcome.extraction.fields.warrantyMonths).toBeUndefined();
  });

  it("keeps the evidence for each item's warranty", () => {
    expect(kase.warrantyEvidence?.value).toBe('"Warranty: 6 months"');
  });
});

describe("mergeExtractions", () => {
  // Fictional: the attached invoice has the items; the email has the order number and return window.
  const invoice = parseDocument([
    "Sharma Electronics",
    "Tax Invoice",
    "Invoice No: SE/2026/0457  Date: 03/09/2026",
    "Philips Mixer Grinder HL7756  Rs. 4,299.00",
    "Grand Total  Rs. 4,798.00",
    "Extension board 4-way  Rs. 499.00",
  ]);
  const email = parseDocument([
    "Your order is confirmed",
    "Order Number: SE-ORD-99812",
    "Order Date: 3 Sep 2026",
    "Grand Total  Rs. 4,798.00",
    "Return window closes on 13 Sep 2026",
  ]);

  it("fills what the invoice lacks from the email, and keeps the invoice's items", () => {
    if (!invoice.ok || !email.ok) throw new Error("fixtures should parse");
    const merged = mergeExtractions(invoice.extraction, [email.extraction]);
    expect(merged.fields.invoiceRef?.value).toBe("SE/2026/0457");
    expect(merged.fields.orderRef?.value).toBe("SE-ORD-99812");
    expect(merged.fields.returnBy?.value).toBe("2026-09-13");
    expect(merged.lines.map((l) => l.name.value)).toEqual(["Philips Mixer Grinder HL7756", "Extension board 4-way"]);
    expect(merged.reviewReasons).toContain("Some details were filled in from the email around the attachment.");
  });

  it("is more certain of values both documents agree on", () => {
    if (!invoice.ok || !email.ok) throw new Error("fixtures should parse");
    const merged = mergeExtractions(invoice.extraction, [email.extraction]);
    expect(merged.fields.total?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(merged.fields.date?.confidence).toBeGreaterThanOrEqual(0.95);
  });
});

describe("product names that contain label words", () => {
  it("keeps items named like phone, pan or rate", () => {
    const o = parseDocument([
      "Tax Invoice",
      "Invoice No: EX-1  Date: 01/10/2026",
      "1  Example Phone Stand  Rs. 349.00",
      "2  Example Non-stick Fry Pan 24 cm  Rs. 899.00",
      "3  Example Band with Heart Rate Monitor  Rs. 2,499.00",
      "Phone: 98765 43210  Rs. 0.00",
      "Grand Total  Rs. 3,747.00",
    ]);
    expect(o.ok && o.extraction.lines.map((l) => l.name.value)).toEqual([
      "Example Phone Stand",
      "Example Non-stick Fry Pan 24 cm",
      "Example Band with Heart Rate Monitor",
    ]);
  });
});

describe("marketplace order email, forwarded by hand", () => {
  // Fictional, in the layout of a marketplace "Ordered:" email: progress steps, an
  // invisible direction mark before the order number, the price with raised paise
  // ("₹299" + "⁰⁰" reads "₹29900"), then "Keep shopping for" recommendations.
  const lines = [
    "---------- Forwarded message ---------", "From: Amazon.in <auto-confirm@amazon.in>",
    "Date: Wed, Oct 28, 2026 at 9:52 AM", 'Subject: Ordered: "Example Flash Drum Toy for..."', "To: <asha@example.edu>",
    'Ordered: "Example Flash Drum Toy for..."͏   ­͏   ­', "Your Orders Your Account Buy Again", "Thanks for your order!",
    "Ordered", "Shipped", "Out for delivery", "Delivered", "Arriving today 2 pm – 6 pm", "Asha – EXAMPLE CITY, EXAMPLE STATE",
    "Order # ‫402-1234567-7654321", "View or edit order", "Example Flash Drum Toy for Kids wi...", "Quantity: 1",
    "₹29900", "Total  ₹304.00", "Keep shopping for", "-50% ₹949.00", "Example Rangoli Set –...", "-84% ₹1,410.00",
    "Example Travel Pillow...", "©2026 Amazon.com, Inc. or its affiliates. All rights reserved.",
  ];

  it("reads the one item at ₹299, not ₹29,900, and none of the recommendations", () => {
    const outcome = parseDocument(lines);
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Example Flash Drum Toy for Kids wi...", 1, 299],
    ]);
    expect(x.fields.total?.value).toBe(304);
    expect(x.fields.orderRef?.value).toBe("402-1234567-7654321");
    expect(x.fields.merchant?.value).toBe("Amazon");
    expect(x.fields.date?.value).toBe("2026-10-28");
  });

  it("dates an email forwarded by a filter (no date in its text) by when it was sent", () => {
    const filtered = lines.slice(5); // without the "Forwarded message" header and its Date line
    const undated = parseDocument(filtered);
    if (!undated.ok) throw new Error(undated.reason);
    expect(undated.extraction.fields.date?.state).toBe("missing");
    const dated = parseDocument(filtered, { sentOn: "2026-10-28" });
    if (!dated.ok) throw new Error(dated.reason);
    expect(dated.extraction.fields.date).toEqual({ value: "2026-10-28", state: "extracted", confidence: 0.7 });
    expect(dated.extraction.reviewReasons).not.toContain("No date found.");
  });

  it("reads an email confirming several orders: each price within its own order", () => {
    // Fictional, in the same layout: three orders in one email, each with its own
    // order number and total. The middle item costs more than the last order's total.
    const several = [
      ...lines.slice(0, 14),
      "Order # \u202b402-1111111-1111111", "View or edit order", "Example Coconut Oil (Cold...", "Quantity: 1",
      "₹22000", "Total  ₹221.15",
      "Arriving today 4 pm – 8 pm", "Asha – EXAMPLE CITY, EXAMPLE STATE",
      "Order # \u202b402-2222222-2222222", "View or edit order", "Example Baby Body Wash...", "Quantity: 1",
      "₹50300", "Total  ₹505.55",
      "Arriving Saturday", "Asha – EXAMPLE CITY, EXAMPLE STATE",
      "Order # \u202b402-3333333-3333333", "View or edit order", "Example Fridge Storage Boxes...", "Quantity: 1",
      "₹24900", "Total  ₹250.30",
      "Saved items and similar deals", "-46% ₹2,141.00", "Example Over-Door Organiser...",
    ];
    const outcome = parseDocument(several);
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.price.value])).toEqual([
      ["Example Coconut Oil (Cold...", 220],
      ["Example Baby Body Wash...", 503],
      ["Example Fridge Storage Boxes...", 249],
    ]);
    // What was paid is the three orders together.
    expect(x.fields.total?.value).toBe(977);
  });

  it("names the shop from the sender when the text doesn't", () => {
    const filtered = lines.slice(5).filter((l) => !l.startsWith("©"));
    const amazon = parseDocument(filtered, { sender: "Amazon.in <auto-confirm@amazon.in>" });
    if (!amazon.ok) throw new Error(amazon.reason);
    expect(amazon.extraction.fields.merchant).toEqual({ value: "Amazon", state: "extracted", confidence: 0.9 });
    const unknown = filtered.map((l) => l.replace(/Amazon/g, "Shop"));
    const shop = parseDocument(unknown, { sender: '"Example Kids Store" <orders@kids.example>' });
    if (!shop.ok) throw new Error(shop.reason);
    expect(shop.extraction.fields.merchant?.value).toBe("Example Kids Store");
    // Forwarded by hand from a personal mailbox: the sender is the person, not the shop.
    const person = parseDocument(unknown, { sender: "Asha <asha.example@gmail.com>" });
    if (!person.ok) throw new Error(person.reason);
    expect(person.extraction.fields.merchant?.value).not.toBe("Asha");
  });

  it("reads raised paise after a thousands group", () => {
    expect(moneyIn("₹1,29900")).toEqual([1299]);
    expect(moneyIn("₹1,24,90000")).toEqual([124900]);
    expect(moneyIn("₹1,299")).toEqual([1299]);
  });

  it("ignores products under any heading when they carry a discount badge", () => {
    // Fictional "Shipped:" email: "Saved items and similar deals", each with a "-38%" badge.
    const shipped = [
      "---------- Forwarded message ---------", "From: Amazon.in <shipment-tracking@amazon.in>",
      "Date: Sun, Oct 18, 2026 at 10:29 AM", "Subject: Shipped: “Example Instant Water Heater 25...”",
      "Your Orders Your Account Buy Again", "Your package was shipped!", "Ordered", "Shipped", "Out for delivery",
      "Delivered", "Arriving today", "Asha – EXAMPLE CITY, EXAMPLE STATE", "Order # \u202b407-7654321-1234567",
      "Track package", "Havells Example Prime 25 Litre S...", "Quantity: 1", "₹9,25000", "Total  ₹9,255.00",
      "Saved items and similar deals", "-38% ₹93.00", "Example Book by Someone...", "-22% ₹499.00",
      "Example Thermal Top...", "-48% ₹471.00", "Example Bangle Stand...",
    ];
    const outcome = parseDocument(shipped);
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Havells Example Prime 25 Litre S...", 1, 9250],
    ]);
    expect(x.fields.total?.value).toBe(9255);
    expect(x.fields.orderRef?.value).toBe("407-7654321-1234567");
    expect(guessCategory("Havells Example Prime 25 Litre S...", "Amazon")).toBe("Appliances");

    // A deal heading worded some other way is caught by the badges alone.
    const renamed = shipped.map((l) => (l === "Saved items and similar deals" ? "Picks we think you'll love" : l));
    const again = parseDocument(renamed);
    if (!again.ok) throw new Error(again.reason);
    expect(again.extraction.lines).toHaveLength(1);
  });
});

describe("home service booking (platform invoice + partner receipt in one PDF)", () => {
  // Fictional, in the layout of an Urban Company booking PDF.
  const lines = [
    "TAX INVOICE", "To (Recipient)  From (Supplier)", "Name  Name", "Asha  Urban Company Limited (Formerly known as",
    "Urbanclap Technologies India Limited)", "Invoice No.", "26INU00000000001", "Business GST", "Delivery Address",
    "00AAAAA0000A1Z0", "Flat 1, Example Apartments, Example City  Address", "Example Tower, Example Road", "Date",
    "03-10-2026", "State Name & Code", "Example State 09", "Place of Supply", "Example State 09", "Items  Amount",
    "Convenience Fee & Platform  Gross Amount  INR 388.98", "Fee - Chimney", "SAC: 999799", "Discount  - INR 0",
    "Taxable Amount  INR 388.98", "IGST @18%  INR 70.02", "Total Tax  INR 70.02", "Subtotal  INR 459",
    "Signature of supplier/authorized representative", "RECEIPT (UC PARTNER RECEIPT)", "To (Recipient)  From (Supplier)",
    "Name  Name", "Asha  Example Partner", "Receipt No.  Address", "26INP00000000002  1 Example Lane, Example Town",
    "Date", "03-10-2026", "Items  Amount", "Service Charge - Chimney  Gross Amount  INR 939", "SAC: 999729",
    "Discount  - INR 0", "Subtotal  INR 939",
  ];

  it("reads the work, each service and fee as its own line, and the whole amount paid", () => {
    const outcome = parseDocument(lines);
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.documentKind).toBe("service_receipt");
    expect(x.fields.provider?.value).toBe("Urban Company");
    expect(x.fields.date?.value).toBe("2026-10-03");
    expect(x.fields.workPerformed?.value).toBe("Chimney service");
    expect(x.fields.labourCost?.value).toBe(939);
    expect(x.fields.total?.value).toBe(1398);
    expect(x.parts.map((p) => [p.name.value, p.price.value, p.kind])).toEqual([
      ["Convenience Fee & Platform Fee - Chimney", 459, "fee"],
      ["Service Charge - Chimney", 939, "service"],
    ]);
    expect(x.reviewReasons).toContain("The total includes Urban Company's fees of ₹459 (with tax).");
    expect(x.reviewReasons.some((r) => r.startsWith("Items don't add up"))).toBe(false);
  });

  it("lists spare parts on the partner's receipt as parts", () => {
    const withPart = [...lines.slice(0, -1), "Filter Mesh - Chimney  Gross Amount  INR 450", "SAC: 999729", "Subtotal  INR 1,389"];
    const outcome = parseDocument(withPart);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.extraction.parts.map((p) => [p.name.value, p.price.value, p.kind])).toEqual([
      ["Convenience Fee & Platform Fee - Chimney", 459, "fee"],
      ["Service Charge - Chimney", 939, "service"],
      ["Filter Mesh - Chimney", 450, "part"],
    ]);
    expect(outcome.extraction.fields.labourCost?.value).toBe(939);
    expect(outcome.extraction.fields.total?.value).toBe(1848);
  });
});

describe("refund notice", () => {
  // Fictional, in the layout of a marketplace refund email.
  const lines = [
    "Dear Customer,", "Greetings from Amazon.in",
    "We are writing to confirm that your refund for ₹503.00 has been processed for your Order # 402-2222222-2222222.",
    "This refund is for the following item(s):",
    "Item: Example Baby Moments Gentle Body Wash And Shampoo For Soft Hair 500ml", "Quantity: 1", "ASIN: B000000000",
    "Reason for refund: Item not satisfactory", "Here's the breakdown of your refund:",
    "Item Refund: ₹479.04", "Item Tax Refund: ₹23.96", "Shipping Refund: ₹9.04", "Shipping Tax Refund: ₹0.46",
    "Shipping Promotion Deduction*: -₹9.04", "Shipping Promotion Tax Deduction*: -₹0.46",
    "* About Promotions:", "Your refund is being credited as follows:", "Original Payment Method: ₹503.00",
  ];

  it("reads the refund, its order number and the item, not a new purchase", () => {
    const outcome = parseDocument(lines, { sentOn: "2026-10-20" });
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.documentKind).toBe("refund_notice");
    expect(x.fields.total?.value).toBe(503);
    expect(x.fields.orderRef?.value).toBe("402-2222222-2222222");
    expect(x.fields.merchant?.value).toBe("Amazon");
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Example Baby Moments Gentle Body Wash And Shampoo For Soft Hair 500ml", 1, 503],
    ]);
    expect(x.reviewReasons).toEqual([]);
  });

  it("finds the amount from the credit line when the sentence doesn't give it", () => {
    const outcome = parseDocument(lines.map((l) => l.replace("your refund for ₹503.00 has", "your refund has")));
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.extraction.fields.total?.value).toBe(503);
  });
});

describe("fashion marketplace order email", () => {
  // Fictional, in the layout of a fashion marketplace's order email: brand and
  // product on separate lines, "Size … | Qty …", the price paid then the
  // crossed-out MRP, "Saved ₹…", "Sold by", and a price breakup at the end.
  const lines = [
    "Hello Asha!", "Sit Back And Relax. Your Order Is Confirmed on Sun, 26 Oct", "VIEW ORDER DETAILS",
    "Based on your purchase experience on the Myntra app/website, how likely are you to recommend Myntra?",
    "1", "2", "3", "Very Poor  Very Good", "Quick Details", "Your order ID", "1000001-2000002-3000003",
    "Example Kids Label", "Boys Printed Sweatshirt", "Size 2Y | Qty 1", "₹755.00 ₹1799.00", "Saved ₹1044.00", "Sold by: Example Retail",
    "Example & Sons", "Boys Graphic Printed Cotton Sweatshirt", "Size 3-4Y | Qty 1", "₹655.00 ₹799.00", "Saved ₹144.00", "Sold by: Example Net",
    "Example Kids Label", "Boys Graphic Printed Hooded Pullover Sw...", "Size 7-8Y | Qty 1", "₹965.00 ₹2299.00", "Saved ₹1334.00",
    "Sold by: Example Retail", "Price breakup", "MRP", "₹4897.00", "Discount", "- ₹2522.00", "Discounted Price", "₹2375.00",
    "Platform Fee", "₹23.00", "Total Amount", "₹2398.00", "Net Paid", "₹2398.00", "You saved ₹2522.00 on this order.",
    "Paid by UPI", "Delivering at", "Asha, Flat 1, Example Apartments, Example City 100001",
  ];

  it("reads each item at the price paid, with its brand, and the order ID below its label", () => {
    const outcome = parseDocument(lines, { sentOn: "2026-10-26" });
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Example Kids Label Boys Printed Sweatshirt", 1, 755],
      ["Example & Sons Boys Graphic Printed Cotton Sweatshirt", 1, 655],
      ["Example Kids Label Boys Graphic Printed Hooded Pullover Sw...", 1, 965],
    ]);
    expect(x.fields.orderRef?.value).toBe("1000001-2000002-3000003");
    expect(x.fields.total?.value).toBe(2398);
    expect(x.fields.merchant?.value).toBe("Myntra");
    expect(x.reviewReasons).not.toContain("Items don't add up to the total. Check for shipping, fees, discounts or a misread price.");
  });
});
