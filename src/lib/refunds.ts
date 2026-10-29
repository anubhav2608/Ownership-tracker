import type { ItemStatus, Order } from "@/lib/types";

/** What an order really cost: its total less money back, and nothing once cancelled. */
export function amountSpent(order: Pick<Order, "total" | "status" | "refundedAmount">) {
  if (order.status === "cancelled") return 0;
  return Math.max(0, order.total - (order.refundedAmount ?? 0));
}

/** Returned or cancelled: never kept, so it isn't counted as owned or spent on. */
export const notKept = (status: ItemStatus) => status === "returned" || status === "cancelled";
