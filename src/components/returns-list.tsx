import Link from "next/link";
import { ItemStatusBadge, OrderStatusBadge, Pill } from "@/components/badges";
import { formatDate, formatMoney } from "@/lib/format";
import type { ReturnEntry } from "@/lib/refunds";

/** One row per purchase: when, where, what went back, and the money. */
export function ReturnsList({ entries }: { entries: ReturnEntry[] }) {
  return (
    <ul className="divide-y">
      {entries.map((e) => (
        <li key={e.order.id}>
          <Link href={`/purchases/${e.order.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.order.merchant}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(e.date.slice(0, 10))} · bought {formatDate(e.order.orderDate)}
              </p>
              {e.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {e.items.map((i) => (
                    <li key={i.id} className="flex min-w-0 items-center gap-2 text-xs">
                      <span className="truncate text-foreground/80">{i.name}</span>
                      <ItemStatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {e.pending ? (
                <Pill tone="warning">Refund pending</Pill>
              ) : (
                e.refunded > 0 && <span className="text-sm tabular-nums text-success">+{formatMoney(e.refunded)}</span>
              )}
              <OrderStatusBadge status={e.order.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
