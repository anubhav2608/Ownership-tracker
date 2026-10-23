import { connection } from "next/server";
import type { InboxRecord, Item, Reminder } from "./types";

// Placeholder data for the UI prototype. The async getters at the bottom
// mirror the Supabase queries that will replace them.

const currentUser = {
  name: "Anubhav",
  email: "anubhav2608@gmail.com",
  forwardingAddress: "u_7f3k9q@in.ownership.app",
  verifiedSenders: ["anubhav2608@gmail.com"],
};

const items: Item[] = [
  {
    id: "itm_macbook",
    name: "MacBook Air 13\"",
    brand: "Apple",
    model: "M4, 16 GB / 512 GB",
    serialNumber: "C02XK3ZJMD6T",
    category: "Electronics",
    status: "active",
    purchase: {
      merchant: "Apple Store",
      date: "2025-11-12",
      price: 124900,
      orderId: "W1384920571",
      source: "email",
      invoiceFile: "apple-invoice-W1384920571.pdf",
    },
    warranty: { provider: "Apple", months: 12, expiresOn: "2026-11-12" },
    services: [],
  },
  {
    id: "itm_washer",
    name: "Front-load washing machine",
    brand: "LG",
    model: "FHP1209Z5M 9 kg",
    serialNumber: "504KWAB3K291",
    category: "Appliances",
    status: "active",
    purchase: {
      merchant: "Croma",
      date: "2024-03-02",
      price: 38990,
      orderId: "CRM-88213-0042",
      source: "upload",
      invoiceFile: "croma-invoice.jpg",
    },
    warranty: {
      provider: "LG",
      months: 36,
      expiresOn: "2027-03-02",
      extended: true,
    },
    services: [
      {
        id: "svc_1",
        date: "2024-03-05",
        type: "installation",
        title: "Installation and demo",
        provider: "LG Service",
        cost: 0,
      },
      {
        id: "svc_2",
        date: "2025-08-19",
        type: "repair",
        title: "Drain pump replaced",
        provider: "LG Service",
        cost: 0,
        notes: "Covered under warranty. Technician: R. Kumar.",
      },
      {
        id: "svc_3",
        date: "2026-06-10",
        type: "maintenance",
        title: "Drum cleaning",
        provider: "UrbanClap",
        cost: 649,
      },
    ],
  },
  {
    id: "itm_car",
    name: "Hyundai Creta",
    brand: "Hyundai",
    model: "SX(O) 1.5 Petrol",
    serialNumber: "MALC381RLPM104221",
    category: "Vehicle",
    status: "active",
    purchase: {
      merchant: "Hyundai Motors Dealer",
      date: "2024-01-20",
      price: 1765000,
      source: "manual",
    },
    warranty: { provider: "Hyundai", months: 36, expiresOn: "2027-01-20" },
    services: [
      {
        id: "svc_4",
        date: "2024-04-22",
        type: "maintenance",
        title: "First free service (1,000 km)",
        provider: "Hyundai Service",
        cost: 0,
      },
      {
        id: "svc_5",
        date: "2025-01-18",
        type: "maintenance",
        title: "Periodic service (10,000 km)",
        provider: "Hyundai Service",
        cost: 6420,
      },
      {
        id: "svc_6",
        date: "2026-01-25",
        type: "maintenance",
        title: "Periodic service (20,000 km)",
        provider: "Hyundai Service",
        cost: 8915,
        notes: "Brake pads replaced.",
      },
    ],
  },
  {
    id: "itm_headphones",
    name: "WH-1000XM6 headphones",
    brand: "Sony",
    category: "Electronics",
    status: "active",
    purchase: {
      merchant: "Amazon",
      date: "2026-10-15",
      price: 29990,
      orderId: "408-1938842-1173903",
      source: "email",
      invoiceFile: "amazon-invoice.pdf",
    },
    warranty: { provider: "Sony", months: 12, expiresOn: "2027-10-15" },
    returnWindowEndsOn: "2026-10-25",
    services: [],
  },
  {
    id: "itm_ac",
    name: "Split AC 1.5 ton",
    brand: "Daikin",
    model: "FTKM50U",
    category: "Appliances",
    status: "active",
    purchase: {
      merchant: "Flipkart",
      date: "2023-04-11",
      price: 46490,
      orderId: "OD428119283746",
      source: "email",
    },
    warranty: { provider: "Daikin", months: 60, expiresOn: "2028-04-11" },
    services: [
      {
        id: "svc_7",
        date: "2026-04-02",
        type: "maintenance",
        title: "Pre-summer servicing",
        provider: "Daikin Service",
        cost: 1200,
      },
    ],
  },
  {
    id: "itm_sofa",
    name: "3-seater sofa",
    brand: "IKEA",
    model: "KIVIK",
    category: "Furniture",
    status: "sold",
    purchase: {
      merchant: "IKEA",
      date: "2021-07-03",
      price: 42990,
      source: "manual",
    },
    services: [],
  },
  {
    id: "itm_phone",
    name: "Pixel 9",
    brand: "Google",
    category: "Electronics",
    status: "returned",
    purchase: {
      merchant: "Flipkart",
      date: "2025-02-10",
      price: 74999,
      orderId: "OD431100928811",
      source: "email",
    },
    services: [],
  },
];

const inbox: InboxRecord[] = [
  {
    id: "inb_1",
    receivedAt: "2026-10-22T18:42:00",
    source: "email",
    subject: "Your Amazon.in order of \"Philips Air Fryer…\" and 1 more item",
    from: "anubhav2608@gmail.com",
    status: "needs_review",
    reason: "Low confidence on 2 fields",
    parser: "deterministic",
    merchant: { value: "Amazon", confidence: 0.99 },
    orderId: { value: "171-5562210-9921145", confidence: 0.98 },
    date: { value: "2026-10-22", confidence: 0.97 },
    total: { value: 10498, confidence: 0.62 },
    lines: [
      {
        name: { value: "Philips Air Fryer HD9252", confidence: 0.95 },
        price: { value: 8999, confidence: 0.93 },
        quantity: 1,
      },
      {
        name: { value: "Silicone liner (2-pack)", confidence: 0.58 },
        price: { value: 1499, confidence: 0.71 },
        quantity: 1,
      },
    ],
  },
  {
    id: "inb_2",
    receivedAt: "2026-10-21T10:05:00",
    source: "upload",
    subject: "service-bill-oct.jpg",
    status: "needs_review",
    reason: "Looks like a service bill. Confirm which item it belongs to.",
    parser: "llm",
    merchant: { value: "Hyundai Service", confidence: 0.88 },
    date: { value: "2026-10-19", confidence: 0.81 },
    total: { value: 2350, confidence: 0.9 },
    lines: [
      {
        name: { value: "Wheel alignment and balancing", confidence: 0.84 },
        price: { value: 2350, confidence: 0.9 },
        quantity: 1,
        matchItemId: "itm_car",
      },
    ],
  },
  {
    id: "inb_3",
    receivedAt: "2026-10-23T08:12:00",
    source: "email",
    subject: "Fwd: Your Croma invoice",
    from: "anubhav2608@gmail.com",
    status: "processing",
    reason: "Extracting text from the attached PDF",
    lines: [],
  },
  {
    id: "inb_4",
    receivedAt: "2026-10-20T14:30:00",
    source: "upload",
    subject: "IMG_2041.HEIC",
    status: "failed",
    reason: "Image too blurry to read. Try a clearer photo or enter the details by hand.",
    lines: [],
  },
];

const reminders: Reminder[] = [
  {
    id: "rem_1",
    itemId: "itm_headphones",
    kind: "return",
    dueOn: "2026-10-25",
    label: "Return window closes",
  },
  {
    id: "rem_2",
    itemId: "itm_macbook",
    kind: "warranty",
    dueOn: "2026-11-12",
    label: "Warranty expires",
  },
  {
    id: "rem_3",
    itemId: "itm_washer",
    kind: "service",
    dueOn: "2026-12-10",
    label: "Drum cleaning due",
  },
  {
    id: "rem_4",
    itemId: "itm_car",
    kind: "service",
    dueOn: "2027-01-20",
    label: "Periodic service (30,000 km)",
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

export async function getInbox() {
  await connection();
  return inbox;
}

export async function getInboxRecord(id: string) {
  await connection();
  return inbox.find((r) => r.id === id);
}

export async function getReminders() {
  await connection();
  return reminders;
}
