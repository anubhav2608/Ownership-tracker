import { daysUntil, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A date something runs out (return window, warranty): amber when it's close,
 * muted once it has passed or no longer matters (item returned or sold).
 */
export function Deadline({
  label,
  iso,
  soonDays,
  active = true,
  stacked = false,
}: {
  label?: string;
  iso: string;
  soonDays: number;
  active?: boolean;
  /** In table columns: the date on one line, how long is left under it. */
  stacked?: boolean;
}) {
  const d = daysUntil(iso);
  const tone = !active || d < 0 ? "text-muted-foreground" : d <= soonDays ? "font-medium text-warning" : "";
  const note = !active ? "" : d < 0 ? "passed" : d === 0 ? "today" : d <= soonDays ? `${d} day${d === 1 ? "" : "s"} left` : "";
  if (stacked) {
    return (
      <span className={cn("block tabular-nums", tone)}>
        <span className="whitespace-nowrap">{formatDate(iso)}</span>
        {note && <span className="block text-xs">{note}</span>}
      </span>
    );
  }
  return (
    <span className={cn("tabular-nums", tone)}>
      {label && <span className="font-normal text-muted-foreground">{label} </span>}
      {formatDate(iso)}
      {note && ` (${note})`}
    </span>
  );
}

/** Return windows warn in their last week, warranties in their last month. */
export const RETURN_SOON_DAYS = 7;
export const WARRANTY_SOON_DAYS = 30;
