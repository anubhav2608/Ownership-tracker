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
