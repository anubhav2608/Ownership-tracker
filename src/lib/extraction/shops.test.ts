import { describe, expect, it } from "vitest";
import { parseDocument } from "./parse";

// Fictional emails in the layouts of Indian shopping sites (orders, several
// items, cancellations, returns, refunds, shipping updates), as the email
// reader passes them on: one line per block of text.

const emails: Record<string, { lines: string[]; expect: string }> = {
  "flipkart-cancellation-subject": {
    expect: "cancellation · OD300000000000000000 · Example Toy Car · refund 499",
    lines: ["Subject: Cancellation of your Order OD300000000000000000", "Flipkart", "Hi Asha,",
      "As requested, your order has been cancelled.", "Order ID OD300000000000000000",
      "Example Remote Control Toy Car", "Seller: Example Toys", "Qty: 1", "₹499",
      "Refund Details", "Refund of ₹499 will be credited to your original payment method."],
  },
  "flipkart-cancellation-short": {
    expect: "cancellation · OD300000000000000001 · price shown, not a new purchase",
    lines: ["Cancellation of your Order OD300000000000000001", "Flipkart",
      "Example Steel Water Bottle 1L", "Qty: 1", "₹349", "Total ₹349"],
  },
  "flipkart-order-single": {
    expect: "order · OD330012345678901100 · Example Steam Iron 1200W (White) ₹1,099 · total 1099",
    lines: ["Flipkart", "Order Confirmation", "Hi Asha,", "Your order has been successfully placed.", "Order placed on Oct 24, 2026",
      "Order ID OD330012345678901100", "Item(s) in this order", "Example Steam Iron 1200W (White)", "Seller: Example Retail", "Qty: 1", "₹1,099",
      "Delivery by Mon, Oct 27", "Amount Paid", "₹1,099", "Manage your order"],
  },
  "flipkart-order-multi": {
    expect: "order · OD330098765432101200 · Example Bedsheet ₹649, Example Pillow x2 ₹598 · total 1287 (incl 40 delivery)",
    lines: ["Flipkart", "Your Order has been placed!", "Order ID OD330098765432101200", "Order Date: 25 Oct 2026",
      "Example Cotton Double Bedsheet with 2 Pillow Covers", "Seller: Example Home", "Qty: 1", "₹649",
      "Example Microfibre Pillow (Pack of 1)", "Seller: Example Home", "Qty: 2", "₹598",
      "Price Details", "Price (3 items) ₹1,247", "Delivery Charges ₹40", "Total Amount ₹1,287"],
  },
  "flipkart-cancelled": {
    expect: "cancellation · OD330012345678901100 · Example Steam Iron · refund 1099",
    lines: ["Flipkart", "Order Cancelled", "Hi Asha,", "Your order for Example Steam Iron 1200W (White) has been cancelled as per your request.",
      "Order ID OD330012345678901100", "Example Steam Iron 1200W (White)", "Qty: 1", "₹1,099",
      "Refund of ₹1,099 will be credited to your original payment method within 5-7 business days."],
  },
  "flipkart-refund": {
    expect: "refund · OD330012345678901100 · refund 1099",
    lines: ["Flipkart", "Refund Processed!", "Your refund of ₹1,099 for Order ID OD330012345678901100 has been processed.",
      "Example Steam Iron 1200W (White)", "Refund Amount", "₹1,099", "Refund mode: Original payment method"],
  },
  "flipkart-return-requested": {
    expect: "return · OD330098765432101200 · Example Microfibre Pillow · refund pending (0)",
    lines: ["Flipkart", "Return Request Accepted", "Hi Asha, your return request for Example Microfibre Pillow (Pack of 1) has been accepted.",
      "Order ID OD330098765432101200", "Pickup by Tue, Oct 28", "Refund will be initiated after the item is picked up."],
  },
  "amazon-cancelled": {
    expect: "cancellation · 402-5555555-5555555 · Example Ceramic Mug · refund 349",
    lines: ["Amazon.in", "Your order has been cancelled", "Hello Asha,", "We've cancelled the following item(s) from your order #402-5555555-5555555 as you requested:",
      "Example Ceramic Coffee Mug 350ml", "Quantity: 1", "If you've already been charged, you'll receive a refund of ₹349.00 within 2-4 business days."],
  },
  "amazon-return-received": {
    expect: "return · 402-6666666-6666666 · Example Headphones · refund 1499",
    lines: ["Amazon.in", "Return received", "We've received your return for Order # 402-6666666-6666666.",
      "Item: Example Wireless Headphones, Black", "Quantity: 1", "Refund total: ₹1,499.00",
      "Your refund has been initiated and will be credited to your original payment method."],
  },
  "amazon-shipped": {
    expect: "shipped update (not a new purchase)",
    lines: ["Amazon.in", "Shipped: \"Example Ceramic Coffee...\"", "Your package was shipped!", "Ordered", "Shipped", "Out for delivery", "Delivered",
      "Arriving Tuesday", "Order # 402-7777777-7777777", "Example Ceramic Coffee Mug 350ml", "Quantity: 1", "₹34900", "Total ₹349.00", "Track package"],
  },
  "myntra-cancelled": {
    expect: "cancellation · 1000001-2000002-3000003 · Example sweatshirt · refund 755",
    lines: ["Myntra", "Your order has been cancelled", "Hi Asha, as requested, we have cancelled the item(s) below.", "Order ID: 1000001-2000002-3000003",
      "Example Kids Label", "Boys Printed Sweatshirt", "Size 2Y | Qty 1", "₹755.00",
      "Refund of ₹755.00 has been initiated to your original payment method."],
  },
  "myntra-refund-credited": {
    expect: "refund · 1000001-2000002-3000003 · refund 655",
    lines: ["Myntra", "Refund Credited", "Hi Asha, your refund of ₹655.00 for the return of Boys Graphic Printed Cotton Sweatshirt has been credited.",
      "Order ID 1000001-2000002-3000003", "Return ID 9999999", "Refund Amount ₹655.00", "Credited to: UPI"],
  },
  "ajio-order": {
    expect: "order · FN1234567890 · Example Men Slim Fit Shirt ₹899 · total 899",
    lines: ["AJIO", "Thank you for shopping with us!", "Your order is confirmed", "Order No: FN1234567890", "Order Date: 24 Oct 2026",
      "Example Brand Men Slim Fit Shirt", "Size: M", "Qty: 1", "₹899", "Order Total", "₹899", "Payment Mode: UPI"],
  },
  "nykaa-order": {
    expect: "order · NYK-12345678-9 · Example Lipstick x2 ₹598, Example Kajal ₹199 · total 797",
    lines: ["Nykaa", "Order Confirmed", "Order ID: NYK-12345678-9", "Ordered on 24 Oct 2026",
      "Example Matte Lipstick - Ruby Red  x 2  ₹598", "Example Kajal - Black  x 1  ₹199",
      "Sub Total ₹797", "Shipping Charges FREE", "Grand Total ₹797"],
  },
  "meesho-order": {
    expect: "order · 123456789012345678 · Example Saree ₹349 · total 349",
    lines: ["Meesho", "Your order has been placed", "Order ID: 123456789012345678", "Example Women's Printed Georgette Saree", "Size: Free Size", "Qty: 1", "₹349",
      "Total Amount ₹349", "Payment: Cash on Delivery"],
  },
  "blinkit-order": {
    expect: "order · ~5 items · total 412 (incl 2 handling + 25 delivery)",
    lines: ["Blinkit", "Order Summary", "Order ID: ORD123456789", "24 Oct 2026, 8:15 PM",
      "Example Full Cream Milk 500 ml  2 x ₹34  ₹68", "Example Brown Bread 400 g  1 x ₹50  ₹50", "Example Bananas 6 pcs  1 x ₹60  ₹60",
      "Example Basmati Rice 1 kg  1 x ₹150  ₹150", "Example Eggs 6 pcs  1 x ₹57  ₹57",
      "Item Total ₹385", "Handling Charge ₹2", "Delivery Charge ₹25", "Bill Total ₹412"],
  },
  "croma-order": {
    expect: "order · 1234567 · Example 1.5 Ton AC ₹38,990 · total 38990",
    lines: ["Croma", "Thank you for your order", "Order Number: 1234567", "Order Date: 24-10-2026",
      "Product  Qty  Price", "Example 1.5 Ton 5 Star Inverter Split AC  1  ₹38,990.00", "Sub Total  ₹38,990.00", "Delivery  FREE", "Order Total  ₹38,990.00"],
  },
};

const expected: Record<string, { kind: string; outcome: string | null; ref: string; total: number | null; items: (string | number | null)[][] }> = {
  "flipkart-cancellation-subject": { kind: "refund_notice", outcome: "cancelled", ref: "OD300000000000000000", total: 499, items: [["Example Remote Control Toy Car", 1, 499]] },
  "flipkart-cancellation-short": { kind: "refund_notice", outcome: "cancelled", ref: "OD300000000000000001", total: 349, items: [["Example Steel Water Bottle 1L", 1, 349]] },
  "flipkart-order-single": { kind: "order_confirmation", outcome: null, ref: "OD330012345678901100", total: 1099, items: [["Example Steam Iron 1200W (White)", 1, 1099]] },
  "flipkart-order-multi": { kind: "order_confirmation", outcome: null, ref: "OD330098765432101200", total: 1287, items: [["Example Cotton Double Bedsheet with 2 Pillow Covers", 1, 649], ["Example Microfibre Pillow (Pack of 1)", 2, 598]] },
  "flipkart-cancelled": { kind: "refund_notice", outcome: "cancelled", ref: "OD330012345678901100", total: 1099, items: [["Example Steam Iron 1200W (White)", 1, 1099]] },
  "flipkart-refund": { kind: "refund_notice", outcome: "returned", ref: "OD330012345678901100", total: 1099, items: [] },
  "flipkart-return-requested": { kind: "refund_notice", outcome: "returned", ref: "OD330098765432101200", total: null, items: [["Example Microfibre Pillow (Pack of 1)", 1, null]] },
  "amazon-cancelled": { kind: "refund_notice", outcome: "cancelled", ref: "402-5555555-5555555", total: 349, items: [["Example Ceramic Coffee Mug 350ml", 1, 349]] },
  "amazon-return-received": { kind: "refund_notice", outcome: "returned", ref: "402-6666666-6666666", total: 1499, items: [["Example Wireless Headphones, Black", 1, 1499]] },
  "amazon-shipped": { kind: "other", outcome: null, ref: "402-7777777-7777777", total: 349, items: [["Example Ceramic Coffee Mug 350ml", 1, 349]] },
  "myntra-cancelled": { kind: "refund_notice", outcome: "cancelled", ref: "1000001-2000002-3000003", total: 755, items: [["Example Kids Label Boys Printed Sweatshirt", 1, 755]] },
  "myntra-refund-credited": { kind: "refund_notice", outcome: "returned", ref: "1000001-2000002-3000003", total: 655, items: [["Boys Graphic Printed Cotton Sweatshirt", 1, 655]] },
  "ajio-order": { kind: "order_confirmation", outcome: null, ref: "FN1234567890", total: 899, items: [["Example Brand Men Slim Fit Shirt", 1, 899]] },
  "nykaa-order": { kind: "order_confirmation", outcome: null, ref: "NYK-12345678-9", total: 797, items: [["Example Matte Lipstick - Ruby Red", 2, 598], ["Example Kajal - Black", 1, 199]] },
  "meesho-order": { kind: "order_confirmation", outcome: null, ref: "123456789012345678", total: 349, items: [["Example Women's Printed Georgette Saree", 1, 349]] },
  "blinkit-order": { kind: "order_confirmation", outcome: null, ref: "ORD123456789", total: 412, items: [["Example Full Cream Milk 500 ml", 2, 68], ["Example Brown Bread 400 g", 1, 50], ["Example Bananas 6 pcs", 1, 60], ["Example Basmati Rice 1 kg", 1, 150], ["Example Eggs 6 pcs", 1, 57]] },
  "croma-order": { kind: "order_confirmation", outcome: null, ref: "1234567", total: 38990, items: [["Example 1.5 Ton 5 Star Inverter Split AC", 1, 38990]] },
};

describe("shop emails", () => {
  it.each(Object.keys(expected))("%s", (name) => {
    const outcome = parseDocument(emails[name].lines, { sentOn: "2026-10-24" });
    if (!outcome.ok) throw new Error(outcome.reason);
    const x = outcome.extraction;
    const want = expected[name];
    expect(x.documentKind).toBe(want.kind);
    expect(x.fields.outcome?.value ?? null).toBe(want.outcome);
    expect(x.fields.orderRef?.value).toBe(want.ref);
    expect(x.fields.total?.value ?? null).toBe(want.total);
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual(want.items);
  });

  it("marks a shipping update, and not an order email's progress steps", () => {
    const shipped = parseDocument(emails["amazon-shipped"].lines, { sentOn: "2026-10-24" });
    const ordered = parseDocument(emails["flipkart-order-single"].lines);
    expect(shipped.ok && shipped.extraction.update).toBe(true);
    expect(ordered.ok && ordered.extraction.update).toBeFalsy();
  });
});
