import { describe, expect, it } from "vitest";
import { amountSpent, notKept } from "./refunds";

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
