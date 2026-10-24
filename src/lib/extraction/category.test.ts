import { describe, expect, it } from "vitest";
import { guessCategory } from "./category";

describe("guessCategory", () => {
  it("recognises common kinds of item", () => {
    expect(guessCategory("Sony WH-1000XM5 Wireless Headphones")).toBe("Electronics");
    expect(guessCategory("Silicone Case for iPhone 16")).toBe("Accessories");
    expect(guessCategory("LG 8 kg Front Load Washing Machine")).toBe("Appliances");
    expect(guessCategory("Ergonomic Office Chair")).toBe("Furniture");
  });

  it("doesn't match words inside other words", () => {
    expect(guessCategory("Bluetooth Speaker Pack")).toBe("Electronics");
  });
});
