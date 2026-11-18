import { describe, expect, it } from "vitest";
import { describeFilter, filteredHref, inPeriod, isFiltered, parseViewFilter } from "./view-filter";

describe("the dashboard's filters in a link", () => {
  it("round-trips through a URL", () => {
    const href = filteredHref("/purchases", { merchant: "H&M", category: "Clothing", from: "2026-11-01", to: "2026-11-30" }, { type: "items" });
    expect(href).toBe("/purchases?type=items&merchant=H%26M&category=Clothing&from=2026-11-01&to=2026-11-30");
    const params = Object.fromEntries(new URL(href, "https://x").searchParams);
    expect(parseViewFilter(params)).toEqual({ merchant: "H&M", category: "Clothing", from: "2026-11-01", to: "2026-11-30" });
  });

  it("ignores what it doesn't recognise", () => {
    expect(parseViewFilter({ category: "Spaceships", from: "yesterday", merchant: "  " })).toEqual({});
    expect(isFiltered(parseViewFilter({}))).toBe(false);
    expect(filteredHref("/items", {})).toBe("/items");
  });

  it("keeps days in the period, inclusive", () => {
    const f = { from: "2026-11-01", to: "2026-11-30" };
    expect(inPeriod(f, "2026-11-01")).toBe(true);
    expect(inPeriod(f, "2026-11-30")).toBe(true);
    expect(inPeriod(f, "2026-10-31")).toBe(false);
    expect(inPeriod(f, undefined)).toBe(false);
    expect(inPeriod({}, undefined)).toBe(true);
  });

  it("describes itself for the banner", () => {
    expect(describeFilter({ merchant: "Croma", from: "2026-11-01", to: "2026-11-30" })).toBe("Croma · 1 Nov 2026 – 30 Nov 2026");
  });
});
