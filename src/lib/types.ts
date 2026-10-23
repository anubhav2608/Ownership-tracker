// Domain model. Mirrors the planned Supabase tables: orders, items, documents,
// service_events and imports are separate entities (spec §4A).

export type Category =
  | "Electronics"
  | "Appliances"
  | "Vehicle"
  | "Furniture"
  | "Accessories"
  | "Home";

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
    date?: Tracked<string>;
    total?: Tracked<number>;
    warrantyMonths?: Tracked<number>;
    provider?: Tracked<string>;
    workPerformed?: Tracked<string>;
  };
  lines?: ExtractedLine[];
  parts?: ExtractedLine[];
  candidates?: MatchCandidate[];
  /** What the import created, once saved. */
  result?: { orderId?: string; itemIds?: string[]; serviceEventId?: string };
}
