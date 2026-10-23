import { AlertCircle, CircleDashed, Eye } from "lucide-react";
import type { InboxStatus } from "@/lib/types";
import { Badge, type Tone } from "./ui";

const meta: Record<InboxStatus, { tone: Tone; label: string; icon: typeof Eye }> = {
  needs_review: { tone: "warn", label: "Needs review", icon: Eye },
  processing: { tone: "info", label: "Processing", icon: CircleDashed },
  failed: { tone: "danger", label: "Couldn't read", icon: AlertCircle },
};

export function InboxStatusBadge({ status }: { status: InboxStatus }) {
  const { tone, label, icon: Icon } = meta[status];
  return (
    <Badge tone={tone}>
      <Icon className={status === "processing" ? "size-3 animate-spin" : "size-3"} />
      {label}
    </Badge>
  );
}

export function ConfidenceDot({ confidence }: { confidence: number }) {
  const tone =
    confidence >= 0.9 ? "bg-accent" : confidence >= 0.75 ? "bg-warn" : "bg-danger";
  return (
    <span
      title={`${Math.round(confidence * 100)}% confident`}
      className={`inline-block size-2 shrink-0 rounded-full ${tone}`}
    />
  );
}
