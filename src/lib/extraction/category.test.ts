import { describe, expect, it } from "vitest";
import { guessCategory } from "./category";

describe("guessCategory", () => {
  it("recognises common kinds of item", () => {
    expect(guessCategory("Sony WH-1000XM5 Wireless Headphones")).toBe("Electronics");
    expect(guessCategory("Silicone Case for iPhone 16")).toBe("Accessories");
    expect(guessCategory("LG 8 kg Front Load Washing Machine")).toBe("Appliances");
    expect(guessCategory("Ergonomic Office Chair")).toBe("Furniture");
    expect(guessCategory("Philips Air Fryer HD9252")).toBe("Appliances");
    expect(guessCategory("Example Brand Boys Printed Sweatshirt, Size: 2Y")).toBe("Clothing");
    expect(guessCategory("Example Brand Girls Hooded Pullover, Size: L (7-8Y)")).toBe("Clothing");
  });

  it("says Other when it can't tell", () => {
    expect(guessCategory("Gift voucher")).toBe("Other");
  });

  it("doesn't match words inside other words", () => {
    expect(guessCategory("Bluetooth Speaker Pack")).toBe("Electronics");
  });
});
