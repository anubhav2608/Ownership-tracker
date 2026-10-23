export type ItemStatus = "active" | "returned" | "sold" | "disposed";

export type Category =
  | "Electronics"
  | "Appliances"
  | "Vehicle"
  | "Furniture"
  | "Home";

export type RecordSource = "email" | "upload" | "manual";

export type ServiceType = "repair" | "maintenance" | "installation" | "inspection";

export interface Purchase {
  merchant: string;
  date: string;
  price: number;
  orderId?: string;
  source: RecordSource;
  invoiceFile?: string;
}

export interface Warranty {
  provider: string;
  months: number;
  expiresOn: string;
  extended?: boolean;
}

export interface ServiceEvent {
  id: string;
  date: string;
  type: ServiceType;
  title: string;
  provider: string;
  cost?: number;
  notes?: string;
}

export interface Item {
  id: string;
  name: string;
  brand: string;
  model?: string;
  serialNumber?: string;
  category: Category;
  status: ItemStatus;
  purchase: Purchase;
  warranty?: Warranty;
  returnWindowEndsOn?: string;
  services: ServiceEvent[];
}

export type InboxStatus = "needs_review" | "processing" | "failed";

export interface ExtractedField<T = string> {
  value: T;
  confidence: number;
}

export interface ExtractedLine {
  name: ExtractedField;
  price: ExtractedField<number>;
  quantity: number;
  matchItemId?: string;
}

export interface InboxRecord {
  id: string;
  receivedAt: string;
  source: RecordSource;
  subject: string;
  from?: string;
  status: InboxStatus;
  reason: string;
  parser?: "deterministic" | "llm";
  merchant?: ExtractedField;
  orderId?: ExtractedField;
  date?: ExtractedField;
  total?: ExtractedField<number>;
  lines: ExtractedLine[];
}

export interface Reminder {
  id: string;
  itemId: string;
  kind: "warranty" | "return" | "service";
  dueOn: string;
  label: string;
}
