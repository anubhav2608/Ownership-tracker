import type { Json } from "@/lib/supabase/database.types";
import type { ExtractedLine, Tracked } from "@/lib/types";

// A service invoice read this accurately, and matched to one of the user's cars
// beyond doubt, is saved without waiting for review. Below it, the user checks
// the reading and confirms it.

/** The reading's overall accuracy (0–1) at which an invoice no longer needs a check. */
export const AUTO_SAVE_ACCURACY = 0.8;
/** The car must be matched this surely, and clearly ahead of any other (as in the review screen). */
const MATCH_SCORE = 0.9;
const MATCH_GAP = 0.15;

const HARD_TO_READ = /^Some values were hard to read/;

type Field = Tracked<string | number> | undefined;

/**
 * How sure the reader is of what it read overall: the average confidence of
 * every value it found (the fields, and each part's name and price).
 * Null when it found nothing.
 */
export function readingAccuracy(fields: Record<string, Field>, parts: ExtractedLine[] = []): number | null {
  const found = [...Object.values(fields), ...parts.flatMap((p) => [p.name, p.price])].filter(
    (t): t is NonNullable<Field> => t !== undefined && t.state !== "missing" && t.value !== null,
  );
  if (found.length === 0) return null;
  return found.reduce((sum, t) => sum + (t.state === "confirmed" ? 1 : (t.confidence ?? 0)), 0) / found.length;
}

interface ServiceOutcome {
  status: string;
  document_kind?: string;
  extracted?: Json;
  review_reasons?: string[];
  candidates?: Json;
}

/**
 * The service event to save for a reading that needs no check, or null when the
 * user should look first: not read accurately enough, anything flagged, or no
 * car matched beyond doubt (it's never attached on a guess).
 */
export function serviceAutoSave(outcome: ServiceOutcome) {
  if (outcome.status !== "needs_review" || outcome.document_kind !== "service_receipt") return null;
  // Any other flag (totals that don't add up, a possible duplicate) needs a person. A few
  // hard-to-read values are already counted in the accuracy below.
  if ((outcome.review_reasons ?? []).some((r) => !HARD_TO_READ.test(r))) return null;

  const x = outcome.extracted as { fields?: Record<string, Field>; parts?: ExtractedLine[] } | undefined;
  const f = x?.fields ?? {};
  const date = f.date?.value;
  const work = f.workPerformed?.value;
  const total = f.total?.value;
  if (!date || !work || total === null || total === undefined) return null;

  const accuracy = readingAccuracy(f, x?.parts);
  if (accuracy === null || accuracy < AUTO_SAVE_ACCURACY) return null;

  const ranked = ((outcome.candidates ?? []) as { item_id: string; score: number }[])
    .slice()
    .sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (!top || top.score < MATCH_SCORE || (second && top.score - second.score <= MATCH_GAP)) return null;

  const odometer = f.odometerKm?.value;
  return {
    accuracy,
    event: {
      item_id: top.item_id,
      service_date: String(date),
      work_performed: String(work),
      provider: f.provider?.value ? String(f.provider.value) : null,
      total_cost: Number(total),
      labour_cost: f.labourCost?.value != null ? Number(f.labourCost.value) : null,
      odometer_km: odometer != null ? Math.round(Number(odometer)) : null,
      parts: (x?.parts ?? [])
        .filter((p) => p.name.value)
        .map((p) => ({ name: String(p.name.value), cost: p.price.value ?? null, kind: p.kind ?? "part" })),
    } as Json,
  };
}
