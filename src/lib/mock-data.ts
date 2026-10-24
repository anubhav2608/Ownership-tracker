import { connection } from "next/server";
import type {
  ImportRecord,
  Item,
  Order,
  ServiceEvent,
  StoredDocument,
} from "./types";

// Fictional sample data for the UI prototype (spec §7: no real user documents).
// The async getters at the bottom mirror the Supabase queries that replace them.

const currentUser = {
  id: "demo-user",
  name: "Anubhav",
  email: "anubhav2608@gmail.com",
  forwardingAddress: "u_7f3k9q@in.ownership.app",
  verifiedSenders: ["anubhav2608@gmail.com"],
  pendingSenders: [] as string[],
};

const confirmed = <T,>(value: T) => ({ value, state: "confirmed" as const });
const extracted = <T,>(value: T, confidence: number) => ({
  value,
  state: "extracted" as const,
  confidence,
});
const missing = { value: null, state: "missing" as const };

const documents: StoredDocument[] = [
  { id: "doc_apple", kind: "invoice", fileName: "apple-invoice-W1384920571.pdf", sizeKb: 182, source: "email", addedAt: "2025-11-12" },
  { id: "doc_croma", kind: "invoice", fileName: "croma-invoice.jpg", sizeKb: 1240, source: "upload", addedAt: "2024-03-03" },
  { id: "doc_lg_warranty", kind: "warranty_card", fileName: "lg-extended-warranty.pdf", sizeKb: 96, source: "upload", addedAt: "2024-03-03" },
  { id: "doc_amazon_conf", kind: "order_confirmation", fileName: "Your Amazon.in order 408-1938842-1173903.eml", sizeKb: 64, source: "email", addedAt: "2026-10-15" },
  { id: "doc_amazon_inv", kind: "invoice", fileName: "amazon-invoice-408-1938842.pdf", sizeKb: 210, source: "email", addedAt: "2026-10-16" },
  { id: "doc_flipkart_ac", kind: "invoice", fileName: "flipkart-OD428119283746.pdf", sizeKb: 154, source: "email", addedAt: "2023-04-11" },
  { id: "doc_flipkart_pixel", kind: "order_confirmation", fileName: "Flipkart order OD431100928811.eml", sizeKb: 48, source: "email", addedAt: "2025-02-10" },
  { id: "doc_flipkart_refund", kind: "refund_notice", fileName: "Refund processed for OD431100928811.eml", sizeKb: 31, source: "email", addedAt: "2025-02-24" },
  { id: "doc_hyundai_inv", kind: "invoice", fileName: "creta-tax-invoice.pdf", sizeKb: 402, source: "upload", addedAt: "2024-01-22" },
  { id: "doc_svc_creta_2", kind: "service_receipt", fileName: "Hyundai service invoice RO-55120.pdf", sizeKb: 118, source: "email", addedAt: "2025-01-18" },
  { id: "doc_svc_creta_3", kind: "service_receipt", fileName: "Hyundai service invoice RO-71904.pdf", sizeKb: 126, source: "email", addedAt: "2026-01-25" },
  { id: "doc_uc_ac", kind: "service_receipt", fileName: "Urban Company receipt UC-29381.pdf", sizeKb: 72, source: "email", addedAt: "2026-04-02" },
  { id: "doc_uc_washer", kind: "service_receipt", fileName: "Urban Company receipt UC-31877.pdf", sizeKb: 70, source: "email", addedAt: "2026-06-10" },
];

const orders: Order[] = [
  { id: "ord_apple", merchant: "Apple Store", orderRef: "W1384920571", orderDate: "2025-11-12", total: 124900, status: "completed", source: "email", importId: "imp_apple", documentIds: ["doc_apple"] },
  { id: "ord_croma", merchant: "Croma", orderRef: "CRM-88213-0042", orderDate: "2024-03-02", total: 38990, status: "completed", source: "upload", documentIds: ["doc_croma"] },
  { id: "ord_amazon", merchant: "Amazon", orderRef: "408-1938842-1173903", orderDate: "2026-10-15", total: 31489, status: "completed", source: "email", importId: "imp_amazon_headphones", documentIds: ["doc_amazon_conf", "doc_amazon_inv"] },
  { id: "ord_flipkart_ac", merchant: "Flipkart", orderRef: "OD428119283746", orderDate: "2023-04-11", total: 46490, status: "completed", source: "email", documentIds: ["doc_flipkart_ac"] },
  { id: "ord_flipkart_pixel", merchant: "Flipkart", orderRef: "OD431100928811", orderDate: "2025-02-10", total: 74999, status: "refunded", refundedAmount: 74999, source: "email", importId: "imp_pixel_refund", documentIds: ["doc_flipkart_pixel", "doc_flipkart_refund"] },
  { id: "ord_hyundai", merchant: "Hyundai Motors Dealer", orderDate: "2024-01-20", total: 1765000, status: "completed", source: "manual", documentIds: ["doc_hyundai_inv"] },
  { id: "ord_lg_ac", merchant: "Reliance Digital", orderDate: "2024-05-04", total: 41990, status: "completed", source: "manual", documentIds: [] },
  { id: "ord_ikea", merchant: "IKEA", orderDate: "2021-07-03", total: 42990, status: "completed", source: "manual", documentIds: [] },
];

const items: Item[] = [
  {
    id: "itm_macbook",
    name: "MacBook Air 13\"",
    brand: "Apple",
    model: "M4, 16 GB / 512 GB",
    category: "Electronics",
    status: "owned",
    orderId: "ord_apple",
    purchaseDate: "2025-11-12",
    price: confirmed(124900),
    identifiers: [{ label: "Serial no.", value: "C02XK3ZJMD6T" }],
    warranty: {
      months: 12,
      expiresOn: "2026-11-12",
      provider: "Apple",
      state: "extracted",
      evidence: "Invoice: \"1 year limited warranty\"",
      documentId: "doc_apple",
    },
    documentIds: ["doc_apple"],
  },
  {
    id: "itm_washer",
    name: "Front-load washing machine",
    brand: "LG",
    model: "FHP1209Z5M 9 kg",
    category: "Appliances",
    status: "owned",
    orderId: "ord_croma",
    purchaseDate: "2024-03-02",
    price: confirmed(38990),
    identifiers: [{ label: "Serial no.", value: "504KWAB3K291" }],
    warranty: {
      months: 36,
      expiresOn: "2027-03-02",
      provider: "LG",
      state: "confirmed",
      evidence: "Extended warranty card: \"3 years comprehensive\"",
      documentId: "doc_lg_warranty",
    },
    documentIds: ["doc_croma", "doc_lg_warranty"],
  },
  {
    id: "itm_headphones",
    name: "WH-1000XM6 headphones",
    brand: "Sony",
    category: "Electronics",
    status: "owned",
    orderId: "ord_amazon",
    purchaseDate: "2026-10-15",
    price: extracted(29990, 0.97),
    identifiers: [],
    warranty: {
      months: 12,
      expiresOn: "2027-10-15",
      provider: "Sony",
      state: "extracted",
      evidence: "Invoice: \"Manufacturer warranty: 1 year\"",
      documentId: "doc_amazon_inv",
    },
    documentIds: ["doc_amazon_conf", "doc_amazon_inv"],
  },
  {
    id: "itm_case",
    name: "Headphone carry case",
    brand: "Sony",
    category: "Accessories",
    status: "owned",
    orderId: "ord_amazon",
    purchaseDate: "2026-10-15",
    price: extracted(1499, 0.93),
    identifiers: [],
    documentIds: ["doc_amazon_conf"],
  },
  {
    id: "itm_car",
    name: "Hyundai Creta",
    brand: "Hyundai",
    model: "SX(O) 1.5 Petrol",
    category: "Vehicle",
    status: "owned",
    orderId: "ord_hyundai",
    purchaseDate: "2024-01-20",
    price: confirmed(1765000),
    identifiers: [
      { label: "Registration", value: "KA 03 MX 1234" },
      { label: "VIN", value: "MALC381RLPM104221" },
    ],
    warranty: {
      months: 36,
      expiresOn: "2027-01-20",
      provider: "Hyundai",
      state: "confirmed",
      evidence: "Entered manually",
    },
    documentIds: ["doc_hyundai_inv"],
  },
  {
    id: "itm_ac_daikin",
    name: "Split AC 1.5 ton (living room)",
    brand: "Daikin",
    model: "FTKM50U",
    category: "Appliances",
    status: "owned",
    orderId: "ord_flipkart_ac",
    purchaseDate: "2023-04-11",
    price: confirmed(46490),
    identifiers: [],
    warranty: {
      months: 60,
      expiresOn: "2028-04-11",
      provider: "Daikin",
      state: "extracted",
      evidence: "Invoice: \"5 years on compressor\"",
      documentId: "doc_flipkart_ac",
    },
    documentIds: ["doc_flipkart_ac"],
  },
  {
    id: "itm_ac_lg",
    name: "Split AC 1 ton (bedroom)",
    brand: "LG",
    model: "TS-Q13YNZE",
    category: "Appliances",
    status: "owned",
    orderId: "ord_lg_ac",
    purchaseDate: "2024-05-04",
    price: confirmed(41990),
    identifiers: [],
    documentIds: [],
  },
  {
    id: "itm_phone",
    name: "Pixel 9",
    brand: "Google",
    category: "Electronics",
    status: "returned",
    orderId: "ord_flipkart_pixel",
    purchaseDate: "2025-02-10",
    price: confirmed(74999),
    identifiers: [],
    documentIds: ["doc_flipkart_pixel", "doc_flipkart_refund"],
  },
  {
    id: "itm_sofa",
    name: "3-seater sofa",
    brand: "IKEA",
    model: "KIVIK",
    category: "Furniture",
    status: "sold",
    orderId: "ord_ikea",
    purchaseDate: "2021-07-03",
    price: confirmed(42990),
    identifiers: [],
    documentIds: [],
    notes: "Sold on moving, Aug 2025.",
  },
];

const serviceEvents: ServiceEvent[] = [
  { id: "svc_w1", itemId: "itm_washer", date: "2024-03-05", provider: "LG Service", workPerformed: "Installation and demo", parts: [], totalCost: 0 },
  { id: "svc_w2", itemId: "itm_washer", date: "2025-08-19", provider: "LG Service", workPerformed: "Drain pump replaced (under warranty)", parts: [{ name: "Drain pump", cost: 0 }], totalCost: 0, notes: "Technician: R. Kumar." },
  { id: "svc_w3", itemId: "itm_washer", date: "2026-06-10", provider: "Urban Company", workPerformed: "Deep drum cleaning", parts: [], labourCost: 649, totalCost: 649, documentId: "doc_uc_washer" },
  { id: "svc_c1", itemId: "itm_car", date: "2024-04-22", provider: "Hyundai Service, Indiranagar", workPerformed: "First free service", parts: [], totalCost: 0, odometerKm: 1012 },
  {
    id: "svc_c2", itemId: "itm_car", date: "2025-01-18", provider: "Hyundai Service, Indiranagar", workPerformed: "Periodic service (10,000 km)",
    parts: [{ name: "Engine oil 5W-30 (3.5 L)", cost: 2450 }, { name: "Oil filter", cost: 420 }, { name: "Drain plug washer", cost: 40 }],
    labourCost: 3510, totalCost: 6420, odometerKm: 10140, documentId: "doc_svc_creta_2",
  },
  {
    id: "svc_c3", itemId: "itm_car", date: "2026-01-25", provider: "Hyundai Service, Indiranagar", workPerformed: "Periodic service (20,000 km), front brake pads",
    parts: [{ name: "Engine oil 5W-30 (3.5 L)", cost: 2590 }, { name: "Oil filter", cost: 440 }, { name: "Air filter", cost: 680 }, { name: "Front brake pads", cost: 3200 }],
    labourCost: 2005, totalCost: 8915, odometerKm: 20388, documentId: "doc_svc_creta_3", importId: "imp_creta_service",
  },
  { id: "svc_a1", itemId: "itm_ac_daikin", date: "2026-04-02", provider: "Urban Company", workPerformed: "Jet-pump servicing", parts: [], labourCost: 799, totalCost: 799, documentId: "doc_uc_ac" },
];

const imports: ImportRecord[] = [
  {
    id: "imp_croma_new",
    source: "email",
    receivedAt: "2026-10-23T08:12:00",
    title: "Fwd: Your Croma invoice CRM-91022-0007",
    from: "anubhav2608@gmail.com",
    status: "processing",
    stage: "text_extracted",
    attempts: 1,
    documentKind: "invoice",
  },
  {
    id: "imp_airfryer",
    source: "email",
    receivedAt: "2026-10-22T18:42:00",
    title: "Your Amazon.in order of \"Philips Air Fryer…\" and 1 more item",
    from: "anubhav2608@gmail.com",
    status: "needs_review",
    stage: "matched",
    attempts: 1,
    documentKind: "order_confirmation",
    parser: "amazon-in/order-confirmation@v3",
    reviewReasons: [
      "Total doesn't equal the sum of the items",
      "One item name was only partly readable",
    ],
    fields: {
      merchant: extracted("Amazon", 0.99),
      orderRef: extracted("171-5562210-9921145", 0.98),
      date: extracted("2026-10-22", 0.97),
      total: extracted(10598, 0.62),
      warrantyMonths: missing,
    },
    lines: [
      { name: extracted("Philips Air Fryer HD9252", 0.95), quantity: 1, price: extracted(8999, 0.93) },
      { name: extracted("Silicone liner (2-pa…", 0.58), quantity: 1, price: extracted(1499, 0.71) },
    ],
  },
  {
    id: "imp_uc_ac",
    source: "upload",
    receivedAt: "2026-10-21T10:05:00",
    title: "uc-receipt-oct.jpg",
    status: "needs_review",
    stage: "matched",
    attempts: 1,
    documentKind: "service_receipt",
    parser: "llm",
    reviewReasons: [
      "Two of your items could be the one serviced. Choose which one.",
    ],
    fields: {
      provider: extracted("Urban Company", 0.96),
      date: extracted("2026-10-19", 0.9),
      total: extracted(1148, 0.92),
      workPerformed: extracted("AC jet-pump service + gas top-up check", 0.81),
    },
    parts: [
      { name: extracted("Drain pipe", 0.77), quantity: 1, price: extracted(349, 0.84) },
    ],
    candidates: [
      {
        itemId: "itm_ac_daikin",
        score: 0.52,
        evidence: [
          "Receipt says \"Split AC\"; this is a split AC",
          "Serviced by Urban Company before (Apr 2026)",
        ],
      },
      {
        itemId: "itm_ac_lg",
        score: 0.48,
        evidence: [
          "Receipt says \"Split AC\"; this is a split AC",
          "No service recorded yet",
        ],
      },
    ],
  },
  {
    id: "imp_unverified",
    source: "email",
    receivedAt: "2026-10-21T09:00:00",
    title: "Fwd: Myntra order delivered",
    from: "anu.work@company.example",
    status: "failed",
    stage: "received",
    attempts: 1,
    error: {
      code: "SENDER_NOT_VERIFIED",
      message: "This was forwarded from anu.work@company.example, which isn't one of your verified senders. We haven't read it.",
      stage: "verified",
      retryable: false,
    },
  },
  {
    id: "imp_blurry",
    source: "upload",
    receivedAt: "2026-10-20T14:30:00",
    title: "IMG_2041.HEIC",
    status: "failed",
    stage: "received",
    attempts: 2,
    error: {
      code: "OCR_LOW_QUALITY",
      message: "The photo is too blurry to read. Try a sharper, well-lit photo, or enter the details yourself.",
      stage: "text_extracted",
      retryable: true,
    },
  },
  {
    id: "imp_dup",
    source: "email",
    receivedAt: "2026-10-18T21:10:00",
    title: "Fwd: Your Amazon.in order 408-1938842-1173903",
    from: "anubhav2608@gmail.com",
    status: "duplicate",
    stage: "verified",
    attempts: 1,
    documentKind: "order_confirmation",
    duplicateOfId: "imp_amazon_headphones",
  },
  {
    id: "imp_newsletter",
    source: "email",
    receivedAt: "2026-10-17T07:45:00",
    title: "Fwd: Big Billion Days are here!",
    from: "anubhav2608@gmail.com",
    status: "unsupported",
    stage: "parsed",
    attempts: 1,
    documentKind: "other",
  },
  {
    id: "imp_amazon_headphones",
    source: "email",
    receivedAt: "2026-10-15T12:02:00",
    title: "Your Amazon.in order 408-1938842-1173903",
    from: "anubhav2608@gmail.com",
    status: "imported",
    stage: "saved",
    attempts: 1,
    documentKind: "order_confirmation",
    parser: "amazon-in/order-confirmation@v3",
    result: { orderId: "ord_amazon", itemIds: ["itm_headphones", "itm_case"] },
  },
  {
    id: "imp_creta_service",
    source: "email",
    receivedAt: "2026-01-25T17:30:00",
    title: "Hyundai service invoice RO-71904",
    from: "anubhav2608@gmail.com",
    status: "imported",
    stage: "saved",
    attempts: 1,
    documentKind: "service_receipt",
    parser: "hyundai/service-invoice@v1",
    candidates: [
      {
        itemId: "itm_car",
        score: 0.99,
        evidence: ["Registration KA 03 MX 1234 appears on the invoice"],
      },
    ],
    result: { serviceEventId: "svc_c3" },
  },
  {
    id: "imp_pixel_refund",
    source: "email",
    receivedAt: "2025-02-24T11:00:00",
    title: "Refund processed for order OD431100928811",
    from: "anubhav2608@gmail.com",
    status: "imported",
    stage: "saved",
    attempts: 1,
    documentKind: "refund_notice",
    parser: "flipkart/refund@v2",
    result: { orderId: "ord_flipkart_pixel" },
  },
  {
    id: "imp_apple",
    source: "email",
    receivedAt: "2025-11-12T15:20:00",
    title: "Your Apple Store invoice W1384920571",
    from: "anubhav2608@gmail.com",
    status: "imported",
    stage: "saved",
    attempts: 1,
    documentKind: "invoice",
    parser: "apple/invoice@v1",
    result: { orderId: "ord_apple", itemIds: ["itm_macbook"] },
  },
];

// connection() marks these as request-time data, like a real database read.

export async function getCurrentUser() {
  await connection();
  return currentUser;
}

export async function getItems() {
  await connection();
  return items;
}

export async function getItem(id: string) {
  await connection();
  return items.find((i) => i.id === id);
}

export async function getOrders() {
  await connection();
  return orders;
}

export async function getOrder(id: string) {
  await connection();
  return orders.find((o) => o.id === id);
}

export async function getDocuments(ids?: string[]) {
  await connection();
  return ids ? documents.filter((d) => ids.includes(d.id)) : documents;
}

export async function getServiceEvents(itemId?: string) {
  await connection();
  return itemId ? serviceEvents.filter((e) => e.itemId === itemId) : serviceEvents;
}

export async function getImports() {
  await connection();
  return imports;
}

export async function getImport(id: string) {
  await connection();
  return imports.find((i) => i.id === id);
}

// Sample imports have no stored originals.
export async function getImportDocuments(): Promise<StoredDocument[]> {
  await connection();
  return [];
}
