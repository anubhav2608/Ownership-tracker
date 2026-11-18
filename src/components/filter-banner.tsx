import Link from "next/link";
import { Filter, X } from "lucide-react";
import { describeFilter, isFiltered, type ViewFilter } from "@/lib/view-filter";

/** "Filtered: Croma · 1 Nov – 30 Nov 2026 · Show all", on a page opened from a dashboard box. */
export function FilterBanner({ filter, clearHref, what }: { filter: ViewFilter; clearHref: string; what: string }) {
  if (!isFiltered(filter)) return null;
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/30 bg-accent/60 px-4 py-2.5 text-sm"
      data-testid="filter-banner"
    >
      <Filter className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        Showing {what} for <span className="font-medium">{describeFilter(filter)}</span>, as on the dashboard.
      </span>
      <Link href={clearHref} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <X className="size-3.5" aria-hidden />
        Show all
      </Link>
    </div>
  );
}
