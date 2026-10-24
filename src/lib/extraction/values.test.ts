import { describe, expect, it } from "vitest";
import { amountsIn, moneyIn, parseDate } from "./values";

describe("parseDate", () => {
  it.each([
    ["Order Date: 15.10.2026", "2026-10-15"],
    ["Invoice Date: 10-02-2025", "2025-02-10"],
    ["Date: 03/09/2026", "2026-09-03"],
    ["19 Oct 2026", "2026-10-19"],
    ["24th September, 2026", "2026-09-24"],
    ["Oct 5, 2026", "2026-10-05"],
    ["2026-01-25", "2026-01-25"],
  ])("reads %s", (text, expected) => {
    expect(parseDate(text)).toBe(expected);
  });

  it("reads numeric dates day-first", () => {
    expect(parseDate("01/02/2026")).toBe("2026-02-01");
  });

  it("skips impossible dates and returns the first real one", () => {
    expect(parseDate("Ref 31/02/2026, delivered 01/03/2026")).toBe("2026-03-01");
  });

  it("returns null when there is no date", () => {
    expect(parseDate("Total 4,299.00")).toBeNull();
  });
});

describe("amounts", () => {
  it("reads Indian digit grouping and currency markers", () => {
    expect(amountsIn("₹1,24,900.00 and Rs. 649 and INR 29990")).toEqual([124900, 649, 29990]);
  });

  it("only treats marked or decimal values as money", () => {
    expect(moneyIn("1  Mixer grinder  2  Rs. 4,299.00  18%")).toEqual([4299]);
  });
});
