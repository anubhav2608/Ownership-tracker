import { describe, expect, it } from "vitest";
import { matchItems, type MatchableItem } from "./match";

const car: MatchableItem = {
  id: "car",
  name: "Hyundai Creta",
  brand: "Hyundai",
  model: "SX(O) 1.5 Petrol",
  identifiers: [{ label: "Registration", value: "KA 03 MX 1234" }],
  providers: ["Hyundai Service"],
};
const livingAc: MatchableItem = {
  id: "ac-living",
  name: "Split AC 1.5 ton (living room)",
  brand: "Daikin",
  identifiers: [],
  providers: ["Urban Company"],
};
const bedroomAc: MatchableItem = {
  id: "ac-bedroom",
  name: "Split AC 1 ton (bedroom)",
  brand: "LG",
  identifiers: [],
  providers: [],
};

describe("matchItems", () => {
  it("makes a clear winner when a registration number appears", () => {
    const [top, ...rest] = matchItems("Vehicle No: KA03MX1234  Periodic service 20,000 km", [car, livingAc, bedroomAc], "Hyundai Service");
    expect(top.itemId).toBe("car");
    expect(top.score).toBeGreaterThanOrEqual(0.9);
    expect(top.evidence).toContain("Registration KA 03 MX 1234 appears on the receipt");
    expect(rest).toEqual([]);
  });

  it("returns close scores when only generic words match, so the user chooses", () => {
    const candidates = matchItems("AC Service (Split)  Rs. 799.00", [car, livingAc, bedroomAc], "Urban Company");
    expect(candidates.map((c) => c.itemId).sort()).toEqual(["ac-bedroom", "ac-living"]);
    const [a, b] = candidates;
    expect(a.score).toBeLessThan(0.9);
    expect(a.score - b.score).toBeLessThanOrEqual(0.15);
  });

  it("finds nothing when the receipt mentions none of the items", () => {
    expect(matchItems("Sofa dry cleaning  Rs. 1,200.00", [car, livingAc, bedroomAc])).toEqual([]);
  });
});
