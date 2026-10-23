import {
  Armchair,
  Car,
  Home,
  Laptop,
  Mail,
  PencilLine,
  Upload,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import { daysUntil } from "@/lib/format";
import type { Category, Item, ItemStatus, RecordSource } from "@/lib/types";
import { Badge, type Tone } from "./ui";

const categoryIcons: Record<Category, LucideIcon> = {
  Electronics: Laptop,
  Appliances: WashingMachine,
  Vehicle: Car,
  Furniture: Armchair,
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
  const box = size === "lg" ? "size-14 rounded-xl" : "size-10 rounded-lg";
  return (
    <div
      className={`${box} flex shrink-0 items-center justify-center bg-surface-2 text-muted`}
    >
      <Icon className={size === "lg" ? "size-7" : "size-5"} strokeWidth={1.75} />
    </div>
  );
}

const sourceMeta: Record<RecordSource, { icon: LucideIcon; label: string }> = {
  email: { icon: Mail, label: "Forwarded email" },
  upload: { icon: Upload, label: "Uploaded document" },
  manual: { icon: PencilLine, label: "Manual entry" },
};

export function SourceLabel({ source }: { source: RecordSource }) {
  const { icon: Icon, label } = sourceMeta[source];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

const statusMeta: Record<ItemStatus, { tone: Tone; label: string }> = {
  active: { tone: "accent", label: "Active" },
  returned: { tone: "neutral", label: "Returned" },
  sold: { tone: "neutral", label: "Sold" },
  disposed: { tone: "neutral", label: "Disposed" },
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const { tone, label } = statusMeta[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function warrantyState(item: Item): { tone: Tone; label: string } {
  if (!item.warranty) return { tone: "neutral", label: "No warranty" };
  const d = daysUntil(item.warranty.expiresOn);
  if (d < 0) return { tone: "neutral", label: "Warranty expired" };
  if (d <= 30) return { tone: "warn", label: `Warranty ends in ${d}d` };
  const months = Math.round(d / 30);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const left = years ? `${years}y${rest ? ` ${rest}m` : ""}` : `${months}m`;
  return { tone: "accent", label: `Warranty ${left} left` };
}

export function WarrantyBadge({ item }: { item: Item }) {
  if (item.status !== "active") return null;
  const { tone, label } = warrantyState(item);
  return <Badge tone={tone}>{label}</Badge>;
}
