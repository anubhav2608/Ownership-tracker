import { describe, expect, it } from "vitest";
import { monthInsights } from "./insights";
import { returnsFrom } from "./refunds";
import type { Item, Order, ServiceEvent } from "./types";

const order = (id: string, date: string, total: number, extra: Partial<Order> = {}): Order => ({
  id, merchant: "Example Store", orderDate: date, total, status: "completed", source: "manual", documentIds: [], ...extra,
});
const item = (id: string, orderId: string, name: string, price: number, extra: Partial<Item> = {}) =>
  ({ id, orderId, name, status: "owned", price: { value: price, state: "confirmed" }, ...extra }) as Item;
const service = (date: string, totalCost: number) => ({ id: date, date, totalCost, provider: "Example", workPerformed: "x", parts: [] }) as ServiceEvent;
const text = (x: ReturnType<typeof monthInsights>) => x.map((i) => i.text);

describe("this month in short", () => {
  const today = "2026-11-11";

  it("compares the month so far with the usual month, and names the biggest purchase", () => {
    const orders = [
      order("a", "2026-11-03", 6499, { merchant: "Croma" }), order("b", "2026-11-08", 1500),
      order("c", "2026-10-10", 4000), order("d", "2026-09-10", 3000), order("e", "2026-08-10", 5000),
    ];
    const items = [item("fryer", "a", "Example Air Fryer 4L", 6499), item("x", "b", "Example Lamp", 1500)];
    expect(text(monthInsights({ today, orders, events: [service("2026-11-05", 1000)], items, returns: [] }))).toEqual([
      "₹8,999 spent so far this month, 125% more than your usual month (₹4,000).",
      "Biggest purchase: Example Air Fryer 4L from Croma, ₹6,499.",
    ]);
  });

  it("without history, says what the month is made of", () => {
    const x = monthInsights({ today, orders: [order("a", "2026-11-03", 600)], events: [service("2026-11-05", 400)], items: [], returns: [] });
    expect(x[0].text).toBe("₹1,000 spent so far this month on 1 purchase and 1 service.");
  });

  it("flags a refund still to come, and return windows closing this week", () => {
    const orders = [order("a", "2026-10-20", 503, { merchant: "Amazon" }), order("b", "2026-11-09", 899)];
    const items = [
      item("wash", "a", "Example Body Wash...", 503, { status: "returned", statusChangedAt: "2026-10-28T10:00:00Z" }),
      item("lamp", "b", "Example Desk Lamp", 899, { returnBy: "2026-11-13" }),
    ];
    const x = monthInsights({ today, orders, events: [], items, returns: returnsFrom(orders, items) });
    expect(x.slice(2)).toEqual([
      { text: "₹503 refund still to come from Amazon, 14 days since the return.", href: "/returns", attention: true },
      { text: "Last day to return Example Desk Lamp is in 2 days.", href: "/items/lamp", attention: true },
    ]);
  });

  it("says what came back this month once refunds arrive, and nothing when there's nothing", () => {
    const orders = [order("a", "2026-10-20", 503, { status: "refunded", refundedAmount: 503, refundedAt: "2026-11-02T10:00:00Z" })];
    const items = [item("wash", "a", "Example Body Wash", 503, { status: "returned", statusChangedAt: "2026-11-01T10:00:00Z" })];
    expect(text(monthInsights({ today, orders, events: [], items, returns: returnsFrom(orders, items) }))).toEqual([
      "₹503 came back this month from returns and refunds.",
    ]);
    expect(monthInsights({ today, orders: [], events: [], items: [], returns: [] })).toEqual([]);
  });
});

describe("days in India", () => {
  it("counts a return made just now as today, whatever the time in UTC", () => {
    const orders = [order("a", "2026-10-20", 500, { merchant: "Amazon" })];
    // 21:30 UTC on 10 Nov is 3 am on 11 Nov in India.
    const items = [item("w", "a", "Example Body Wash", 500, { status: "returned", statusChangedAt: "2026-11-10T21:30:00Z" })];
    const x = monthInsights({ today: "2026-11-11", orders, events: [], items, returns: returnsFrom(orders, items) });
    expect(x.at(-1)?.text).toBe("₹500 refund still to come from Amazon, 0 days since the return.");
  });
});
