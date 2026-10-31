import { describe, expect, it } from "vitest";
import { corrections, summarizeFeedback } from "./feedback";

const t = <T,>(value: T) => ({ value, state: "extracted" as const, confidence: 0.9 });

describe("corrections", () => {
  it("compares each field and item as read and as saved", () => {
    const rows = corrections(
      { merchant: t("Example"), total: t(1000), date: t("2026-10-24") },
      { merchant: "example", total: "100", date: "2026-10-24" },
      {
        read: [
          { name: t("Example Mug"), quantity: 1, price: t(100) },
          { name: t("Saved"), quantity: 1, price: t(10) },
        ],
        saved: [{ name: "Example Mug", price: 100 }, null, { name: "Example Spoon", price: 50 }],
      },
    );
    expect(rows.filter((r) => r.changed).map((r) => [r.field, r.extracted, r.saved])).toEqual([
      ["total", "1000", "100"],
      ["item", "Saved", null],
      ["item", null, "Example Spoon"],
    ]);
    expect(rows.filter((r) => !r.changed).map((r) => r.field)).toEqual(["merchant", "date", "item.name", "item.price"]);
  });

  it("summarizes: imports saved untouched, and the most corrected fields", () => {
    const s = summarizeFeedback([
      { import_id: "a", shop: "Amazon", field: "total", changed: false },
      { import_id: "b", shop: "Amazon", field: "total", changed: true },
      { import_id: "b", shop: "Amazon", field: "date", changed: false },
    ]);
    expect(s).toEqual({ imports: 2, untouched: 1, fields: [{ field: "total", shop: "Amazon", compared: 2, changed: 1 }] });
  });
});
