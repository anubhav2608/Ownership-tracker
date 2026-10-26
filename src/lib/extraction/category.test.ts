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

  it("says Miscellaneous when it can't tell", () => {
    expect(guessCategory("Gift voucher")).toBe("Miscellaneous");
  });

  it("doesn't match words inside other words", () => {
    expect(guessCategory("Bluetooth Speaker Pack")).toBe("Electronics");
  });

  it("reads plurals, hyphens and sizes", () => {
    expect(guessCategory("TSS Women Regular Fit Solid Orange T-Shirts, Size: L")).toBe("Clothing");
    expect(guessCategory("Slim Fit Jeans")).toBe("Clothing");
    expect(guessCategory("Printed Cotton Dresses (7-8Y)")).toBe("Clothing");
  });

  it("weighs the thing bought over what it's for", () => {
    expect(guessCategory("Car Charger 30W Dual USB")).toBe("Accessories");
    expect(guessCategory("Sony Headphone Carry Case")).toBe("Accessories");
    expect(guessCategory("Washing Machine Cover")).toBe("Accessories");
    expect(guessCategory("Silicone Case for iPhone 16")).toBe("Accessories");
    expect(guessCategory("Back Cover for Samsung Galaxy S24")).toBe("Accessories");
    expect(guessCategory("ExampleBrand TPU Shockproof Back Cover for Example Phone 14")).toBe("Accessories");
    expect(guessCategory("Example Stand for Laptop and Tablet")).toBe("Accessories");
    expect(guessCategory("Samsung Galaxy S24 5G (8 GB RAM, 256 GB)")).toBe("Electronics");
    expect(guessCategory("Whirlpool 1.5 Ton 3 Star Inverter Split AC")).toBe("Appliances");
    expect(guessCategory("Prestige Pressure Cooker 5 Litre")).toBe("Home");
  });

  it("uses brands and the merchant only to tip close calls", () => {
    expect(guessCategory("Sony")).toBe("Miscellaneous");
    expect(guessCategory("Roadster Men Regular Fit")).toBe("Clothing");
    expect(guessCategory("Graphic Print Co-ord Set", "Myntra")).toBe("Clothing");
  });
});
