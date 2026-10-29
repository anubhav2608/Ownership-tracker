import type { Identifier, MatchCandidate } from "@/lib/types";

// Which of the user's items a service receipt is about (spec §4E). Strong
// evidence (a serial or registration number) can make a clear winner; weak
// evidence (brand, words in the name) only suggests, so the review screen asks.

export interface MatchableItem {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  identifiers: Identifier[];
  /** Providers that have serviced this item before. */
  providers: string[];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const GENERIC_WORDS = new Set(["with", "and", "for", "the", "from", "pack", "black", "white", "inch", "litre", "liter"]);

export function matchItems(text: string, items: MatchableItem[], provider?: string): MatchCandidate[] {
  const haystack = squash(text);
  const words = new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? []);

  const candidates = items.map((item) => {
    let score = 0;
    const evidence: string[] = [];

    for (const idf of item.identifiers) {
      if (squash(idf.value).length >= 5 && haystack.includes(squash(idf.value))) {
        score += 0.9;
        evidence.push(`${idf.label} ${idf.value} appears on the receipt`);
      }
    }
    if (item.model && squash(item.model).length >= 4 && haystack.includes(squash(item.model))) {
      score += 0.5;
      evidence.push(`Model ${item.model} appears on the receipt`);
    }
    if (item.brand && words.has(item.brand.toLowerCase())) {
      score += 0.25;
      evidence.push(`Mentions ${item.brand}`);
    }
    const nameHits = (item.name.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
      (w) => !GENERIC_WORDS.has(w) && words.has(w),
    );
    if (nameHits.length) {
      score += Math.min(0.3, 0.15 * nameHits.length);
      evidence.push(`Mentions "${nameHits.join(" ")}"`);
    }
    if (score > 0 && provider && item.providers.some((p) => p.toLowerCase() === provider.toLowerCase())) {
      score += 0.15;
      evidence.push(`Serviced by ${provider} before`);
    }

    return { itemId: item.id, score: Math.min(0.99, Math.round(score * 100) / 100), evidence };
  });

  return candidates
    .filter((c) => c.score >= 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Lower-case words, without a cut-off name's trailing "…" or its half word. */
function nameWords(name: string) {
  const cut = /(\.\.\.|…)\s*$/.test(name);
  const words = name.toLowerCase().replace(/(\.\.\.|…)\s*$/, "").split(/[^a-z0-9]+/).filter(Boolean);
  return cut && words.length > 1 ? words.slice(0, -1) : words;
}

/**
 * The items of a purchase that a refund notice names. Shops cut names short
 * ("Example Body W..."), so a name matches when one's words begin the other's,
 * or most of the shorter one's words appear in the longer. Only clear matches:
 * an item named by several refund lines, or matching none, is left for the user.
 */
export function matchRefundedItems(refunded: string[], items: { id: string; name: string }[]): string[] {
  const found = new Set<string>();
  for (const name of refunded) {
    const want = nameWords(name);
    const hits = items.filter((item) => {
      const have = nameWords(item.name);
      const [short, long] = want.length <= have.length ? [want, have] : [have, want];
      if (short.length < 2) return false;
      if (short.every((w, i) => long[i] === w)) return true;
      const shared = short.filter((w) => long.includes(w) && !GENERIC_WORDS.has(w)).length;
      return shared >= 3 && shared / short.length >= 0.75;
    });
    if (hits.length === 1) found.add(hits[0].id);
  }
  return [...found];
}

export interface RefundableItem {
  id: string;
  name: string;
  price: number | null;
}

/** Why items were ticked for a refund notice, shown on the review screen. */
export type RefundMatch = "name" | "only_item" | "price" | "whole_order";

/** Whether the notice's text contains the item's name: its first words in order (up to six). */
function mentions(textWords: string, name: string) {
  const words = nameWords(name).slice(0, 6);
  return words.length >= 2 && ` ${textWords} `.includes(` ${words.join(" ")} `);
}

/**
 * The items of a purchase (found by its order number) that a refund,
 * return or cancellation notice is about, and why:
 * 1. by name: the names it lists, or any item named anywhere in its text;
 * 2. the purchase's only item still owned;
 * 3. by price: the one item costing the refund, or all of them when the
 *    refund covers them all;
 * 4. a cancellation naming no items: the whole order.
 * Nothing is ticked otherwise: the user picks.
 */
export function pickRefundedItems({
  names,
  text,
  items,
  amount,
  cancelled,
}: {
  names: string[];
  text: string;
  items: RefundableItem[];
  amount: number | null;
  cancelled: boolean;
}): { itemIds: string[]; by: RefundMatch | null } {
  if (items.length === 0) return { itemIds: [], by: null };
  const textWords = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");
  const named = new Set([...matchRefundedItems(names, items), ...items.filter((i) => mentions(textWords, i.name)).map((i) => i.id)]);
  if (named.size > 0) return { itemIds: items.filter((i) => named.has(i.id)).map((i) => i.id), by: "name" };
  if (items.length === 1) return { itemIds: [items[0].id], by: "only_item" };
  if (amount !== null && amount > 0) {
    const costing = items.filter((i) => i.price !== null && Math.abs(i.price - amount) < 1);
    if (costing.length === 1) return { itemIds: [costing[0].id], by: "price" };
    const all = items.reduce((s, i) => s + (i.price ?? 0), 0);
    if (items.every((i) => i.price !== null) && amount >= all - 1) return { itemIds: items.map((i) => i.id), by: "price" };
  }
  if (cancelled && names.length === 0) return { itemIds: items.map((i) => i.id), by: "whole_order" };
  return { itemIds: [], by: null };
}
