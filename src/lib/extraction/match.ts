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
