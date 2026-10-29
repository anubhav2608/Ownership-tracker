import type { Item, ItemStatus, Order } from "@/lib/types";

/** What an order really cost: its total less money back, and nothing once cancelled. */
export function amountSpent(order: Pick<Order, "total" | "status" | "refundedAmount">) {
  if (order.status === "cancelled") return 0;
  return Math.max(0, order.total - (order.refundedAmount ?? 0));
}

/** Returned or cancelled: never kept, so it isn't counted as owned or spent on. */
export const notKept = (status: ItemStatus) => status === "returned" || status === "cancelled";

export interface ReturnEntry {
  order: Order;
  /** The order's items that went back (returned or cancelled). */
  items: Item[];
  /** Money back on the order. */
  refunded: number;
  /** When it happened: the latest return or refund (the order date if neither is known). */
  date: string;
  /** Items went back but no money has come back yet. */
  pending: boolean;
}

/** Every purchase with something returned, cancelled or refunded, the most recent first. */
export function returnsFrom(orders: Order[], items: Item[]): ReturnEntry[] {
  return orders
    .flatMap((order) => {
      const back = items.filter((i) => i.orderId === order.id && notKept(i.status));
      const refunded = order.refundedAmount ?? 0;
      if (back.length === 0 && refunded === 0 && order.status !== "cancelled") return [];
      const dates = [...back.map((i) => i.statusChangedAt), order.refundedAt].filter((d): d is string => !!d);
      const date = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : order.orderDate;
      return [{ order, items: back, refunded, date, pending: back.length > 0 && refunded === 0 && order.status !== "cancelled" }];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
