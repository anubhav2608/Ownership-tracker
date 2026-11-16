// The demo's story: a car owner. One car with a service history, one other
// purchase, and a service invoice to "forward" (see sampleInvoiceEml). All
// fictional.

export const CAR = {
  name: "Maruti Suzuki Swift VXi",
  brand: "Maruti Suzuki",
  model: "Swift VXi",
  registration: "MH 12 AB 1234",
  chassis: "MA3EXAMPLE0000000",
  price: 745000,
  warrantyMonths: 24,
  /** Days before today it was bought. */
  boughtDaysAgo: 420,
} as const;

export interface DemoService {
  daysAgo: number;
  work: string;
  provider: string;
  odometerKm: number;
  total: number;
  labour: number;
  parts: { name: string; cost: number; kind: "part" | "service" | "fee" }[];
}

export const SERVICES: DemoService[] = [
  {
    daysAgo: 400,
    work: "First free service (1,000 km)",
    provider: "Example Motors Service Centre",
    odometerKm: 1050,
    total: 2250,
    labour: 450,
    parts: [{ name: "Engine oil and oil filter", cost: 1800, kind: "part" }],
  },
  {
    daysAgo: 230,
    work: "Second service (10,000 km)",
    provider: "Example Motors Service Centre",
    odometerKm: 10980,
    total: 3850,
    labour: 1020,
    parts: [
      { name: "Engine oil (5W-30, 3.5 L)", cost: 2450, kind: "part" },
      { name: "Oil filter", cost: 380, kind: "part" },
    ],
  },
  {
    daysAgo: 80,
    work: "Front brake pads replaced, wheel alignment",
    provider: "QuickFit Auto Care",
    odometerKm: 18740,
    total: 6200,
    labour: 1400,
    parts: [
      { name: "Front brake pad set", cost: 3600, kind: "part" },
      { name: "Wheel alignment", cost: 1200, kind: "service" },
    ],
  },
];

export const DASHCAM = { merchant: "Amazon", name: "Example 4K Dashcam with Night Vision", price: 3499, daysAgo: 150 } as const;

const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
export const daysAgo = (n: number, now = new Date()) => day(new Date(now.getTime() - n * 864e5));

/**
 * The service invoice the demo "forwards": a plain-text email from the service
 * centre, as shops send them. Dated today, naming the car by model and
 * registration so it's matched to it, with the odometer reading.
 */
export function sampleInvoiceEml(now = new Date()) {
  const [y, m, d] = day(now).split("-");
  return [
    "From: Example Motors Service Centre <service@examplemotors.example>",
    "To: demo@example.com",
    "Subject: Your service invoice SI-26-0457 from Example Motors Service Centre",
    `Date: ${now.toUTCString()}`,
    "Message-ID: <demo-service-invoice@examplemotors.example>",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Hello,",
    "",
    "Thank you for servicing your car with Example Motors Service Centre.",
    "",
    "SERVICE INVOICE",
    "Job Card No: JC-2026-0457",
    `Invoice Date: ${d}/${m}/${y}`,
    `Vehicle: ${CAR.name}`,
    `Registration No: ${CAR.registration}`,
    "Odometer: 24,310 km",
    "",
    "Description  Amount",
    "Engine oil change (5W-30, 3.5 L)  Rs 2,450.00",
    "Oil filter  Rs 380.00",
    "Air filter  Rs 520.00",
    "Brake pad cleaning  Rs 650.00",
    "Labour charges  Rs 900.00",
    "",
    "Grand Total  Rs 4,900.00",
    "",
    "Paid by UPI. Thank you for choosing Example Motors.",
    "",
  ].join("\r\n");
}
