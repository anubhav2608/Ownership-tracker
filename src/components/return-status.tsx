import { Pill } from "@/components/badges";
import { formatMoney } from "@/lib/format";
import { notKept } from "@/lib/refunds";
import type { Item, Order } from "@/lib/types";

// What happened to a purchase or an item after it was bought: returned,
// cancelled, refunded, or a refund still to come. Shown in the Returns &
// cancellations column of Purchases and Items.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** For a purchase: what went back of it and the money. Null when nothing happened. */
export function OrderReturnStatus({ order, items }: { order: Order; items: Item[] }) {
  const back = items.filter((i) => notKept(i.status));
  const refunded = order.refundedAmount ?? 0;
  const cancelledAll = order.status === "cancelled";
  if (!cancelledAll && back.length === 0 && refunded === 0) return null;

  const allBack = items.length > 0 && back.length === items.length;
  const cancelled = back.length > 0 && back.every((i) => i.status === "cancelled");
  const label = cancelledAll
    ? "Cancelled"
    : allBack
      ? cancelled
        ? "Cancelled"
        : "Returned"
      : back.length
        ? `${back.length} of ${plural(items.length, "item")} ${cancelled ? "cancelled" : "returned"}`
        : order.status === "refunded"
          ? "Refunded"
          : "Partly refunded";
  return (
    <div className="flex flex-col items-start gap-1">
      <Pill tone={cancelledAll || cancelled ? "neutral" : "info"}>{label}</Pill>
      {refunded > 0 ? (
        <span className="text-xs text-success tabular-nums">{formatMoney(refunded)} back</span>
      ) : (
        !cancelledAll && back.length > 0 && <Pill tone="warning">Refund pending</Pill>
      )}
    </div>
  );
}

/** For an item: returned or cancelled, and whether its purchase has had money back. Null while it's kept. */
export function ItemReturnStatus({ item, order }: { item: Item; order?: Order }) {
  if (!notKept(item.status)) return null;
  const refunded = order?.refundedAmount ?? 0;
  const cancelledOrder = order?.status === "cancelled";
  return (
    <div className="flex flex-col items-start gap-1">
      <Pill tone={item.status === "cancelled" ? "neutral" : "info"}>
        {item.status === "cancelled" ? "Cancelled" : "Returned"}
      </Pill>
      {refunded > 0 ? (
        <span className="text-xs text-success">Refunded</span>
      ) : (
        !cancelledOrder && <Pill tone="warning">Refund pending</Pill>
      )}
    </div>
  );
}
