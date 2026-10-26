import { describe, expect, it } from "vitest";
import {
  bodyLines,
  bodyOnlyEmail,
  emailAddress,
  forwardedBy,
  forwardingTokens,
  gmailForwardingConfirmation,
  htmlToLines,
  parseRawEmail,
  textToLines,
} from "./email";
import { parseDocument } from "./parse";

// Fictional order confirmation, laid out like marketplace emails: nested
// tables, inline styles, entities, a hidden preheader and a forwarded header.
const ORDER_HTML = `<!doctype html><html><head><style>td{font-family:Arial}</style><title>Your order</title></head>
<body>
<div style="display:none">Your order has shipped soon &zwnj;</div>
<div>---------- Forwarded message ---------<br>From: Amazon.in &lt;auto-confirm@amazon.in&gt;<br>
Subject: Your Amazon.in order #408-1938842-1173903</div>
<table width="600"><tr><td>
  <h2>Thank you for your order</h2>
  <p>Order <b>#408-1938842-1173903</b></p>
  <p>Order Date: 15 October 2026</p>
  <table>
    <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
    <tr><td><a href="#">Sony WH-1000XM6 Wireless Headphones</a></td><td>1</td><td>&#8377;29,990.00</td></tr>
    <tr><td>Sony Headphone Carry Case</td><td>1</td><td>&#8377;1,499.00</td></tr>
  </table>
  <table>
    <tr><td>Item Subtotal:</td><td>&#8377;31,489.00</td></tr>
    <tr><td>Shipping:</td><td>&#8377;0.00</td></tr>
    <tr><td><b>Order Total:</b></td><td><b>&#8377;31,489.00</b></td></tr>
  </table>
</td></tr></table>
<!-- tracking pixel --><img src="https://example.com/p.gif">
</body></html>`;

describe("htmlToLines", () => {
  it("keeps table cells apart and drops markup, styles and comments", () => {
    const lines = htmlToLines(ORDER_HTML);
    expect(lines).toContain("Sony WH-1000XM6 Wireless Headphones  1  ₹29,990.00");
    expect(lines).toContain("Order Total:  ₹31,489.00");
    expect(lines.join("\n")).not.toMatch(/font-family|tracking pixel|&zwnj;|<\/?(td|tr|div|p|b|img|a)\b|^Your order$/m);
    expect(lines).toContain("From: Amazon.in <auto-confirm@amazon.in>");
  });

  it("reads a forwarded order confirmation end to end", () => {
    const outcome = parseDocument(htmlToLines(ORDER_HTML));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const x = outcome.extraction;
    expect(x.documentKind).toBe("order_confirmation");
    expect(x.fields.merchant?.value).toBe("Amazon");
    expect(x.fields.orderRef?.value).toBe("408-1938842-1173903");
    expect(x.fields.date?.value).toBe("2026-10-15");
    expect(x.fields.total?.value).toBe(31489);
    expect(x.lines.map((l) => [l.name.value, l.price.value])).toEqual([
      ["Sony WH-1000XM6 Wireless Headphones", 29990],
      ["Sony Headphone Carry Case", 1499],
    ]);
  });
});

describe("textToLines / bodyLines", () => {
  it("unquotes plain-text forwards", () => {
    expect(textToLines("> Order Total:\tRs. 499.00\n>> Thanks\n\n")).toEqual(["Order Total:  Rs. 499.00", "Thanks"]);
  });

  it("falls back to the text part when the HTML part is empty", () => {
    expect(bodyLines({ html: "<p> </p>", text: "Invoice No: 123\nGrand Total Rs. 500.00" })).toEqual([
      "Invoice No: 123",
      "Grand Total Rs. 500.00",
    ]);
  });
});

describe("addresses", () => {
  it("extracts the address from a display name", () => {
    expect(emailAddress('"Anu (Work)" <Anu@Example.COM>')).toBe("anu@example.com");
    expect(emailAddress("orders@shop.example")).toBe("orders@shop.example");
    expect(emailAddress("no address here")).toBeNull();
  });

  it("finds forwarding tokens only on our domain, allowing plus-addressing", () => {
    expect(
      forwardingTokens(
        [
          "Anu <u_0123456789abcdef@in.example.com>",
          "u_fedcba9876543210+amazon@IN.example.com",
          "u_0123456789abcdef@elsewhere.example",
          "u_short@in.example.com",
          "someone@in.example.com",
        ],
        "in.example.com",
      ),
    ).toEqual(["u_0123456789abcdef", "u_fedcba9876543210"]);
  });
});

describe("parseRawEmail", () => {
  it("round-trips the stored body-only message", async () => {
    const eml = bodyOnlyEmail({
      from: "Anu <anu@example.com>",
      to: ["u_0123456789abcdef@in.example.com"],
      subject: "Fwd: Your order ₹31,489",
      date: "2026-10-16T09:00:00Z",
      messageId: "<abc@mail.example.com>",
      html: ORDER_HTML,
      text: "Order Total: Rs. 31,489.00",
    });
    const email = await parseRawEmail(eml);
    expect(email.from).toBe("anu@example.com");
    expect(email.subject).toBe("Fwd: Your order ₹31,489");
    expect(email.messageId).toBe("<abc@mail.example.com>");
    expect(bodyLines(email)).toContain("Order Total:  ₹31,489.00");
    expect(email.attachments).toEqual([]);
  });

  it("keeps real attachments and drops inline images", async () => {
    const pdf = Buffer.from("%PDF-1.4 fictional").toString("base64");
    const eml = [
      "From: Shop <billing@shop.example>",
      "To: u_0123456789abcdef@in.example.com",
      "Subject: Invoice",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="x"',
      "",
      "--x",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Please find your invoice attached.",
      "--x",
      'Content-Type: image/png; name="logo.png"',
      "Content-Disposition: inline; filename=\"logo.png\"",
      "Content-ID: <logo>",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--x",
      'Content-Type: application/pdf; name="INV-0457.pdf"',
      'Content-Disposition: attachment; filename="INV-0457.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      pdf,
      "--x--",
      "",
    ].join("\r\n");
    const email = await parseRawEmail(eml);
    expect(email.attachments.map((a) => [a.fileName, a.mimeType])).toEqual([["INV-0457.pdf", "application/pdf"]]);
    expect(Buffer.from(email.attachments[0].content).toString()).toBe("%PDF-1.4 fictional");
  });
});

describe("shop emails with recommendations", () => {
  // Fictional, laid out like a marketplace "Ordered:" email: the order, then advertising.
  const html = `<html><body>
<p>Hello Asha,</p><p>Thank you for your order. We'll send a confirmation when your item ships.</p>
<table><tr><td>Order #407-1234567-7654321</td></tr><tr><td>Placed on Friday, 23 October 2026</td></tr></table>
<table><tr><td><a href="#">ExampleBrand TPU Shockproof Back Cover for Example Phone 14</a></td></tr>
<tr><td>Sold by: Example Retail Private Limited</td></tr>
<tr><td>Quantity: 1</td><td>₹299.00</td></tr></table>
<table><tr><td>Order Total:</td><td>₹299.00</td></tr></table>
<h3>Related to items you've viewed</h3>
<table><tr><td>Example Tempered Glass Screen Guard</td><td>₹199.00</td></tr>
<tr><td>Example 20W Fast Charger with Cable</td><td>₹899.00</td></tr></table>
<h3>Customers who bought this also bought</h3>
<table><tr><td>Example Phone Stand</td><td>₹349.00</td></tr></table>
</body></html>`;

  it("reads the order and ignores the recommended products", () => {
    const outcome = parseDocument(htmlToLines(html));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.price.value])).toEqual([
      ["ExampleBrand TPU Shockproof Back Cover for Example Phone 14", 299],
    ]);
    expect(x.fields.total?.value).toBe(299);
    expect(x.fields.orderRef?.value).toBe("407-1234567-7654321");
  });
});

describe("shop emails with product details", () => {
  // Fictional: each product's colour and size under its name, the price on its own line.
  const html = `<html><body>
<h1>Thanks for your order!</h1><p>Order number: EXM123456789</p><p>Order date: 24/10/2026</p>
<table><tr><td>Example Runner 5 Shoes</td></tr><tr><td>Colour: Core Black</td></tr>
<tr><td>Size: UK 9</td></tr><tr><td>Quantity: 1</td></tr><tr><td>₹ 7,999.00</td></tr></table>
<table><tr><td>Example Crew Socks 3 Pairs</td></tr><tr><td>Colour: White</td></tr>
<tr><td>Size: M</td></tr><tr><td>Quantity: 2</td></tr><tr><td>₹ 1,198.00</td></tr></table>
<table><tr><td>Total</td><td>₹ 9,197.00</td></tr></table>
</body></html>`;

  it("keeps the names and reads quantity and price from the lines below", () => {
    const outcome = parseDocument(htmlToLines(html));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const x = outcome.extraction;
    expect(x.lines.map((l) => [l.name.value, l.quantity, l.price.value])).toEqual([
      ["Example Runner 5 Shoes", 1, 7999],
      ["Example Crew Socks 3 Pairs", 2, 1198],
    ]);
    expect(x.fields.total?.value).toBe(9197);
  });
});

describe("sportswear-style order emails", () => {
  // Fictional layouts: long detail blocks, labelled or struck-through prices, unlabelled details.
  const order = (items: string) =>
    htmlToLines(`<html><body><p>Thanks for your order!</p><p>Order number: AEX12345678</p>
<p>Order date: 24 October 2026</p>${items}
<table><tr><td>Delivery</td><td>FREE</td></tr><tr><td>Total</td><td>₹ 13,397.00</td></tr></table>
<h3>You may also like</h3><p>Example Tee  ₹1,999.00</p></body></html>`);
  const read = (lines: string[]) => {
    const outcome = parseDocument(lines);
    if (!outcome.ok) throw new Error(outcome.reason);
    return outcome.extraction.lines.map((l) => [l.name.value, l.quantity, l.price.value]);
  };
  const expected = [
    ["EXAMPLE OG SHOES", 1, 10999],
    ["EXAMPLE TREFOIL SOCKS", 2, 2398],
  ];

  it("reads items with article, colour, size and quantity lines before the price", () => {
    const block = (name: string, qty: number, price: string) =>
      `<table><tr><td>${name}</td></tr><tr><td>Article number: EX3437</td></tr><tr><td>Colour: Cloud White / Core Black</td></tr><tr><td>Size: UK 9</td></tr><tr><td>Quantity: ${qty}</td></tr><tr><td>₹ ${price}</td></tr></table>`;
    expect(read(order(block("EXAMPLE OG SHOES", 1, "10,999.00") + block("EXAMPLE TREFOIL SOCKS", 2, "2,398.00")))).toEqual(expected);
  });

  it("reads labelled and struck-through prices", () => {
    expect(
      read(
        order(`<table><tr><td>EXAMPLE OG SHOES</td></tr><tr><td>Size: UK 9</td><td>Qty: 1</td></tr><tr><td>Price: ₹10,999.00</td></tr>
<tr><td>EXAMPLE TREFOIL SOCKS</td></tr><tr><td>Size M | Qty: 2</td></tr><tr><td>₹2,998.00</td><td>INR 2,398.00</td></tr></table>`),
      ),
    ).toEqual(expected);
  });

  it("skips unlabelled colour and size lines", () => {
    expect(
      read(
        order(`<table><tr><td>EXAMPLE OG SHOES</td></tr><tr><td>Cloud White / Core Black / Gum</td></tr><tr><td>UK 9</td></tr><tr><td>1 x ₹10,999.00</td></tr>
<tr><td>EXAMPLE TREFOIL SOCKS</td></tr><tr><td>White / Black</td></tr><tr><td>Size M</td></tr><tr><td>2 x ₹2,398.00</td></tr></table>`),
      ),
    ).toEqual(expected);
  });
});

describe("Gmail forwarding", () => {
  const confirmationText = [
    "asha.example@gmail.com has requested to automatically forward mail to your email",
    "address u_0123456789abcdef@in.example.com.",
    "Confirmation code: 987654321",
    "",
    "To allow asha.example@gmail.com to automatically forward mail to your address, please click the link below to confirm the request:",
    "",
    "https://mail-settings.google.com/mail/vf-%5BEXAMPLE%5D-fictional",
  ].join("\n");
  const confirmation = {
    from: "Gmail Team <forwarding-noreply@google.com>",
    subject: "(#987654321) Gmail Forwarding Confirmation - Receive Mail from asha.example@gmail.com",
    text: confirmationText,
  };

  it("reads Gmail's confirmation email", () => {
    expect(gmailForwardingConfirmation(confirmation)).toEqual({
      gmail: "asha.example@gmail.com",
      code: "987654321",
      link: "https://mail-settings.google.com/mail/vf-%5BEXAMPLE%5D-fictional",
    });
  });

  it("ignores look-alikes: another sender, a failed signature, or a link off Google", () => {
    expect(gmailForwardingConfirmation({ ...confirmation, from: "forwarding-noreply@g00gle.example" })).toBeNull();
    expect(
      gmailForwardingConfirmation({ ...confirmation, headers: { "Authentication-Results": "mx.example; dkim=fail header.d=google.com" } }),
    ).toBeNull();
    const phishy = gmailForwardingConfirmation({ ...confirmation, text: confirmationText.replace("https://mail-settings.google.com", "https://mail-settings.google.com.evil.example") });
    expect(phishy?.link ?? "").not.toMatch(/evil/);
  });

  it("finds who forwarded an email automatically", () => {
    expect(forwardedBy({ "x-forwarded-for": "asha.example@gmail.com u_0123456789abcdef@in.example.com" })).toBe("asha.example@gmail.com");
    expect(forwardedBy({ "Resent-From": "Asha <asha@example.com>" })).toBe("asha@example.com");
    expect(forwardedBy({ from: "orders@shop.example" })).toBeNull();
  });
});
