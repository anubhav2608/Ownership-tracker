import { describe, expect, it } from "vitest";
import type { Extraction } from "@/lib/extraction/parse";
import { kindOf, sameItem, scoreCase, summarize, type Reading } from "./score";

const t = <T,>(value: T, confidence = 0.9) => ({ value, state: "extracted" as const, confidence });
const reading = (over: Partial<Extraction>, extra: Partial<Reading> = {}): Reading => {
  const extraction: Extraction = { documentKind: "order_confirmation", parser: "x", fields: {}, lines: [], parts: [], reviewReasons: [], ...over };
  return { kind: kindOf(extraction), extraction, ...extra };
};

describe("eval scoring", () => {
  it("matches shortened item names", () => {
    expect(sameItem("Example Baby Moments Gentle Body W...", "Example Baby Moments Gentle Body Wash 500ml")).toBe(true);
    expect(sameItem("Example Bedsheet", "Example Pillow")).toBe(false);
  });

  it("scores fields, items, and notes what the reader had highlighted", () => {
    const s = scoreCase(
      "c",
      { kind: "purchase", shop: "Example", total: 100, items: [{ name: "Example Mug", price: 100, qty: 1 }] },
      reading({
        fields: { merchant: t("Example"), total: t(1000, 0.6) },
        lines: [
          { name: t("Example Mug"), quantity: 1, price: t(100) },
          { name: t("Saved"), quantity: 1, price: t(10) },
        ],
      }),
    );
    expect(s.right).toEqual({ kind: 1, shop: 1, itemPrice: 1, itemQty: 1 });
    expect(s.misses).toEqual([
      { field: "total", expected: 100, got: 1000, flagged: true },
      { field: "extraItem", expected: null, got: "Saved" },
    ]);
    const sum = summarize([s]);
    expect([sum.itemPrecision, sum.itemRecall, sum.flaggedShare]).toEqual([0.5, 1, 1]);
  });

  it("breaks a hard rule when a cancellation would be saved as a purchase, or a wrong item is ticked", () => {
    expect(scoreCase("a", { kind: "cancellation" }, reading({})).violations).toEqual(["cancellation read as a new purchase"]);
    const notice = reading({ documentKind: "refund_notice", fields: { outcome: t("returned" as const) } }, { ticked: ["a", "b"] });
    expect(scoreCase("b", { kind: "return_or_refund", itemsBack: ["a"] }, notice).violations).toEqual([
      "ticked an item that didn't go back (b)",
    ]);
  });
});
