// Domain model. Mirrors the planned Supabase tables: orders, items, documents,
// service_events and imports are separate entities (spec §4A).

export const CATEGORIES = [
  "Electronics",
  "Appliances",
  "Vehicle",
  "Furniture",
  "Clothing",
  "Accessories",
  "Home",
  "Miscellaneous",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Category names as stored in the database (enum item_category). Miscellaneous is stored as "other". */
export const categoryValue = (c: Category) =>
  (c === "Miscellaneous" ? "other" : c.toLowerCase()) as Exclude<Lowercase<Category>, "miscellaneous"> | "other";

export type RecordSource = "email" | "upload" | "manual";

/** Where a stored value came from (spec §4C). A null value means "missing". */
export type FieldState = "missing" | "extracted" | "confirmed";

export interface Tracked<T> {
  value: T | null;
  state: FieldState;
  /** 0–1, only for extracted values. */
  confidence?: number;
}

export type OrderStatus = "completed" | "refunded" | "partially_refunded";

export interface Order {
  id: string;
  merchant: string;
  orderRef?: string;
  invoiceRef?: string;
  orderDate: string;
  total: number;
  status: OrderStatus;
  refundedAmount?: number;
  source: RecordSource;
  importId?: string;
  documentIds: string[];
}

export type ItemStatus = "owned" | "returned" | "sold" | "disposed";

export interface Identifier {
  label: string;
  value: string;
}

export interface Warranty {
  months: number;
  /** Defaults to the purchase date when not stated. */
  startsOn?: string;
  expiresOn: string;
  provider: string;
  state: Exclude<FieldState, "missing">;
  /** What in the source supports this warranty, e.g. a quote from the invoice. */
  evidence?: string;
  documentId?: string;
}

export interface Item {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  category: Category;
  status: ItemStatus;
  orderId?: string;
  purchaseDate: string;
  /** Last day the item can be returned, if known. */
  returnBy?: string;
  price: Tracked<number>;
  identifiers: Identifier[];
  /** Absent when no reliable source mentions a warranty. */
  warranty?: Warranty;
  documentIds: string[];
  notes?: string;
}

export interface Part {
  name: string;
  cost?: number;
}

export interface ServiceEvent {
  id: string;
  itemId: string;
  date: string;
  provider: string;
  workPerformed: string;
  parts: Part[];
  labourCost?: number;
  totalCost: number;
  odometerKm?: number;
  documentId?: string;
  importId?: string;
  notes?: string;
}

export type DocumentKind =
  | "order_confirmation"
  | "invoice"
  | "refund_notice"
  | "service_receipt"
  | "warranty_card"
  | "other";

export interface StoredDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  sizeKb: number;
  source: RecordSource;
  addedAt: string;
}

// ── Imports ─────────────────────────────────────────────────────────────

export type ImportStatus =
  | "queued"
  | "processing"
  | "needs_review"
  | "imported"
  | "duplicate"
  | "unsupported"
  | "failed";

export type ImportStage =
  | "received"
  | "verified"
  | "text_extracted"
  | "parsed"
  | "validated"
  | "matched"
  | "saved";

export interface ImportError {
  code: string;
  message: string;
  stage: ImportStage;
  retryable: boolean;
  /** Technical reason for an unexpected failure, to help diagnose it. */
  detail?: string;
}

export interface ExtractedLine {
  name: Tracked<string>;
  quantity: number;
  price: Tracked<number>;
}

export interface MatchCandidate {
  itemId: string;
  score: number;
  evidence: string[];
}

export interface ImportRecord {
  id: string;
  source: Exclude<RecordSource, "manual">;
  receivedAt: string;
  /** Email subject, or file name for uploads. */
  title: string;
  from?: string;
  status: ImportStatus;
  stage: ImportStage;
  attempts: number;
  documentKind?: DocumentKind;
  /** Name of the deterministic template, or "llm" when the fallback ran. */
  parser?: string;
  reviewReasons?: string[];
  error?: ImportError;
  duplicateOfId?: string;
  fields?: {
    merchant?: Tracked<string>;
    orderRef?: Tracked<string>;
    invoiceRef?: Tracked<string>;
    date?: Tracked<string>;
    total?: Tracked<number>;
    warrantyMonths?: Tracked<number>;
    /** The words on the document that state the warranty. */
    warrantyEvidence?: Tracked<string>;
    returnBy?: Tracked<string>;
    provider?: Tracked<string>;
    workPerformed?: Tracked<string>;
    labourCost?: Tracked<number>;
  };
  lines?: ExtractedLine[];
  parts?: ExtractedLine[];
  /** The text read from the document, line by line, to show what extraction saw. */
  text?: string[];
  candidates?: MatchCandidate[];
  /** What the import created, once saved. */
  result?: { orderId?: string; itemIds?: string[]; serviceEventId?: string };
}
