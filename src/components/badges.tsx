import {
  AlertCircle,
  Armchair,
  Ban,
  Car,
  CheckCircle2,
  CircleDashed,
  Clock,
  Copy,
  Eye,
  Headphones,
  Home,
  Laptop,
  Mail,
  PencilLine,
  Upload,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  Category,
  DocumentKind,
  FieldState,
  ImportStatus,
  Item,
  ItemStatus,
  OrderStatus,
  RecordSource,
} from "@/lib/types";

const tones = {
  neutral: "bg-secondary text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export type Tone = keyof typeof tones;

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return <Badge className={cn(tones[tone], className)}>{children}</Badge>;
}

// ── Items ───────────────────────────────────────────────────────────────

const categoryIcons: Record<Category, LucideIcon> = {
  Electronics: Laptop,
  Appliances: WashingMachine,
  Vehicle: Car,
  Furniture: Armchair,
  Accessories: Headphones,
  Home: Home,
};

export function CategoryIcon({
  category,
  size = "md",
}: {
  category: Category;
  size?: "md" | "lg";
}) {
  const Icon = categoryIcons[category];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-muted text-muted-foreground",
        size === "lg" ? "size-14 rounded-xl" : "size-10 rounded-lg",
      )}
    >
      <Icon className={size === "lg" ? "size-7" : "size-5"} strokeWidth={1.75} />
    </div>
  );
}

const itemStatus: Record<ItemStatus, { tone: Tone; label: string }> = {
  owned: { tone: "success", label: "Owned" },
  returned: { tone: "neutral", label: "Returned" },
  sold: { tone: "neutral", label: "Sold" },
  disposed: { tone: "neutral", label: "Disposed" },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const { tone, label } = itemStatus[status];
  return <Pill tone={tone}>{label}</Pill>;
}

/** Warranty summary. Shows nothing when no source mentions a warranty. */
export function WarrantyBadge({ item }: { item: Item }) {
  if (item.status !== "owned" || !item.warranty) return null;
  const d = daysUntil(item.warranty.expiresOn);
  if (d < 0) return <Pill>Warranty ended</Pill>;
  if (d <= 30) return <Pill tone="warning">Warranty ends in {d}d</Pill>;
  const months = Math.round(d / 30);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const left = years ? `${years}y${rest ? ` ${rest}m` : ""}` : `${months}m`;
  return <Pill tone="success">Warranty {left} left</Pill>;
}

// ── Orders ──────────────────────────────────────────────────────────────

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  if (status === "completed") return null;
  return (
    <Pill tone="info">{status === "refunded" ? "Refunded" : "Partly refunded"}</Pill>
  );
}

// ── Sources and documents ───────────────────────────────────────────────

const sourceMeta: Record<RecordSource, { icon: LucideIcon; label: string }> = {
  email: { icon: Mail, label: "Forwarded email" },
  upload: { icon: Upload, label: "Upload" },
  manual: { icon: PencilLine, label: "Entered manually" },
};

export function SourceLabel({ source }: { source: RecordSource }) {
  const { icon: Icon, label } = sourceMeta[source];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export const documentKindLabel: Record<DocumentKind, string> = {
  order_confirmation: "Order confirmation",
  invoice: "Invoice",
  refund_notice: "Refund notice",
  service_receipt: "Service receipt",
  warranty_card: "Warranty card",
  other: "Other",
};

// ── Imports ─────────────────────────────────────────────────────────────

const importStatus: Record<ImportStatus, { tone: Tone; label: string; icon: LucideIcon }> = {
  queued: { tone: "neutral", label: "Queued", icon: Clock },
  processing: { tone: "info", label: "Processing", icon: CircleDashed },
  needs_review: { tone: "warning", label: "Needs review", icon: Eye },
  imported: { tone: "success", label: "Imported", icon: CheckCircle2 },
  duplicate: { tone: "neutral", label: "Duplicate", icon: Copy },
  unsupported: { tone: "neutral", label: "Not a receipt", icon: Ban },
  failed: { tone: "danger", label: "Failed", icon: AlertCircle },
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  const { tone, label, icon: Icon } = importStatus[status];
  return (
    <Pill tone={tone}>
      <Icon className={cn(status === "processing" && "animate-spin")} />
      {label}
    </Pill>
  );
}

// ── Field provenance (missing / extracted / confirmed) ─────────────────

export const LOW_CONFIDENCE = 0.8;

export function FieldStateBadge({
  state,
  confidence,
}: {
  state: FieldState;
  confidence?: number;
}) {
  if (state === "missing") return <Pill tone="neutral">Missing</Pill>;
  if (state === "confirmed") return <Pill tone="success">Confirmed</Pill>;
  const low = confidence !== undefined && confidence < LOW_CONFIDENCE;
  return (
    <Pill tone={low ? "warning" : "info"}>
      Extracted{confidence !== undefined && ` · ${Math.round(confidence * 100)}%`}
    </Pill>
  );
}
