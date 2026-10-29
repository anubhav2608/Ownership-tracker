import { describe, expect, it } from "vitest";
import { amountSpent, notKept, returnsFrom } from "./refunds";
import type { Item, Order } from "@/lib/types";

describe("amountSpent", () => {
  it("is the total when nothing came back", () => {
    expect(amountSpent({ total: 3148, status: "completed" })).toBe(3148);
  });
  it("takes off a refund", () => {
    expect(amountSpent({ total: 3148, status: "partially_refunded", refundedAmount: 2499 })).toBe(649);
  });
  it("is nothing for a cancelled order, refunded or not", () => {
    expect(amountSpent({ total: 899, status: "cancelled", refundedAmount: 0 })).toBe(0);
  });
  it("never goes below zero", () => {
    expect(amountSpent({ total: 100, status: "refunded", refundedAmount: 150 })).toBe(0);
  });
});

describe("notKept", () => {
  it("covers returned and cancelled items only", () => {
    expect(["owned", "returned", "sold", "disposed", "cancelled"].filter((s) => notKept(s as never))).toEqual([
      "returned",
      "cancelled",
    ]);
  });
});

describe("returnsFrom", () => {
  const order = (id: string, extra: Partial<Order> = {}): Order => ({
    id, merchant: "Example Store", orderDate: "2026-10-01", total: 1000, status: "completed", source: "manual", documentIds: [], ...extra,
  });
  const item = (id: string, orderId: string, status: Item["status"], statusChangedAt?: string) =>
    ({ id, orderId, status, statusChangedAt, name: id }) as Item;

  it("lists purchases with returns or refunds, newest first", () => {
    const entries = returnsFrom(
      [
        order("kept"),
        order("returned", { status: "partially_refunded", refundedAmount: 400, refundedAt: "2026-10-20T10:00:00Z" }),
        order("cancelled", { status: "cancelled", refundedAmount: 0 }),
        order("waiting"),
      ],
      [
        item("a", "kept", "owned"),
        item("b", "returned", "returned", "2026-10-19T10:00:00Z"),
        item("c", "cancelled", "cancelled", "2026-10-25T10:00:00Z"),
        item("d", "waiting", "returned", "2026-10-22T10:00:00Z"),
      ],
    );
    expect(entries.map((e) => [e.order.id, e.items.map((i) => i.id), e.refunded, e.pending])).toEqual([
      ["cancelled", ["c"], 0, false],
      ["waiting", ["d"], 0, true],
      ["returned", ["b"], 400, false],
    ]);
    // The latest of the return and the refund.
    expect(entries[2].date).toBe("2026-10-20T10:00:00Z");
  });
});
