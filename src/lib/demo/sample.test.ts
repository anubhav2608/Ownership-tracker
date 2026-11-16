import { describe, expect, it } from "vitest";
import { bodyLines, parseRawEmail } from "@/lib/extraction/email";
import { matchItems } from "@/lib/extraction/match";
import { parseDocument } from "@/lib/extraction/parse";
import { CAR, sampleInvoiceEml } from "./sample-data";

describe("the demo's service invoice", () => {
  it("is read as a service on the car, with its odometer", async () => {
    const now = new Date("2026-11-12T08:00:00Z");
    const email = await parseRawEmail(sampleInvoiceEml(now));
    const lines = bodyLines(email);
    const out = parseDocument(lines, { sentOn: "2026-11-12", sender: email.fromHeader });
    if (!out.ok) throw new Error(out.reason);
    const x = out.extraction;
    expect(x.documentKind).toBe("service_receipt");
    expect(x.fields.provider?.value).toBe("Example Motors Service Centre");
    expect(x.fields.date?.value).toBe("2026-11-12");
    expect(x.fields.total?.value).toBe(4900);
    expect(x.fields.odometerKm?.value).toBe(24310);
    expect(x.fields.labourCost?.value).toBe(900);
    expect(x.parts.map((p) => [p.name.value, p.price.value])).toEqual([
      ["Engine oil change (5W-30, 3.5 L)", 2450],
      ["Oil filter", 380],
      ["Air filter", 520],
      ["Brake pad cleaning", 650],
    ]);
    // Only the description of the work is a guess: the rest reads with high confidence.
    expect(x.fields.provider?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(x.fields.workPerformed?.value).toBe("Engine oil change (5W-30, 3.5 L), Oil filter, Air filter, Brake pad cleaning");
    expect(x.fields.workPerformed?.confidence).toBeLessThan(0.8);

    const car = {
      id: "car",
      name: CAR.name,
      brand: CAR.brand,
      model: CAR.model,
      identifiers: [{ label: "Registration", value: CAR.registration }],
      providers: ["Example Motors Service Centre"],
    };
    const dashcam = { id: "cam", name: "Example 4K Dashcam with Night Vision", identifiers: [], providers: [] };
    const matches = matchItems(lines.join("\n"), [car, dashcam], "Example Motors Service Centre");
    // A clear winner: the review screen pre-selects it (and never would a weak guess).
    expect(matches[0]?.itemId).toBe("car");
    expect(matches[0].score).toBeGreaterThanOrEqual(0.9);
    expect(matches[0].score - (matches[1]?.score ?? 0)).toBeGreaterThan(0.15);
  });
});
