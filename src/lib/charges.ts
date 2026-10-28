// The part of an order's total that isn't its items: taxes, delivery and fees
// (or, when the items come to more, a discount). Shown as its own line rather
// than stored, since the total and the item prices are what's saved.

/** Beyond this share of the total, a difference is more likely a misread price than fees. */
const PLAUSIBLE_SHARE = 0.25;

export interface OtherCharges {
  /** Positive: taxes, delivery and fees; negative: a discount. */
  amount: number;
  label: "Taxes, delivery & other charges" | "Discounts";
  /** Too big to be just fees or a discount: worth checking the prices. */
  suspicious: boolean;
}

/** Null when the items match the total, or when a price or the total is unknown. */
export function otherCharges(total: number | null | undefined, prices: (number | null | undefined)[]): OtherCharges | null {
  if (!total || prices.length === 0 || prices.some((p) => p === null || p === undefined)) return null;
  const amount = Math.round((total - prices.reduce<number>((s, p) => s + (p ?? 0), 0)) * 100) / 100;
  if (Math.abs(amount) <= 1) return null;
  return {
    amount,
    label: amount > 0 ? "Taxes, delivery & other charges" : "Discounts",
    suspicious: Math.abs(amount) > total * PLAUSIBLE_SHARE,
  };
}
