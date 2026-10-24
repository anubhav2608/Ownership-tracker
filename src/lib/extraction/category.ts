import type { Category } from "@/lib/types";

// A starting category for an extracted line. Only a default for the review
// screen: the user sees it and can change it before saving.

const RULES: [Category, RegExp][] = [
  ["Accessories", /\b(case|cover|cable|charger|adapter|screen guard|protector|strap|band|stand|mount|pouch|sleeve)\b/i],
  ["Vehicle", /\b(car|scooter|motorcycle|bike|tyre|tire|helmet)\b/i],
  ["Appliances", /\b(ac|air conditioner|refrigerator|fridge|washing machine|microwave|oven|purifier|geyser|heater|dishwasher|vacuum|mixer|grinder|fan|chimney|cooler|fryer|air fryer|toaster|iron|induction|cooktop|blender|juicer)\b/i],
  ["Furniture", /\b(sofa|chair|table|desk|bed|mattress|wardrobe|shelf|cabinet|recliner)\b/i],
  ["Home", /\b(curtain|bedsheet|towel|cookware|lamp|rug|carpet|pillow|bottle|kettle)\b/i],
];

export function guessCategory(name: string): Category {
  return RULES.find(([, re]) => re.test(name))?.[0] ?? "Electronics";
}
