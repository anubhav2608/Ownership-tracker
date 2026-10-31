import type { ExtractedLine, Tracked } from "@/lib/types";

// What the user changed when saving an import, compared field by field with
// what was read: the reader's accuracy on real mail (Settings shows it).

export interface FeedbackRow {
  field: string;
  extracted: string | null;
  saved: string | null;
  changed: boolean;
}

type Value = string | number | null | undefined;

const text = (v: Value) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
/** Equal as the user means it: same text ignoring case and spaces, or the same amount. */
function same(a: Value, b: Value) {
  const [x, y] = [text(a), text(b)];
  if (x === null || y === null) return x === y;
  const [m, n] = [Number(x.replace(/,/g, "")), Number(y.replace(/,/g, ""))];
  if (!Number.isNaN(m) && !Number.isNaN(n)) return Math.abs(m - n) < 0.005;
  return x.toLowerCase().replace(/\s+/g, " ") === y.toLowerCase().replace(/\s+/g, " ");
}

const row = (field: string, extracted: Value, saved: Value): FeedbackRow => ({
  field,
  extracted: text(extracted)?.slice(0, 500) ?? null,
  saved: text(saved)?.slice(0, 500) ?? null,
  changed: !same(extracted, saved),
});

/**
 * Fields as read and as saved, by name ("merchant", "total", …), then the items:
 * each read item kept (its name and price compared), removed, or one the user added.
 */
export function corrections(
  read: Record<string, Tracked<string | number> | undefined>,
  saved: Record<string, Value>,
  items?: { read: ExtractedLine[]; saved: ({ name: Value; price: Value } | null)[] },
): FeedbackRow[] {
  const rows = Object.keys(saved).map((field) => row(field, read[field]?.value, saved[field]));
  if (items) {
    items.saved.forEach((s, i) => {
      const r = items.read[i];
      if (!r) {
        if (s) rows.push(row("item", null, s.name)); // added: one the reader missed
      } else if (!s) {
        rows.push(row("item", r.name.value, null)); // removed: not an item
      } else {
        rows.push(row("item.name", r.name.value, s.name), row("item.price", r.price.value, s.price));
      }
    });
  }
  return rows;
}

export interface FeedbackSummary {
  imports: number;
  /** Saved without changing anything. */
  untouched: number;
  /** By field: how often it was compared and how often changed, worst first. */
  fields: { field: string; shop: string; compared: number; changed: number }[];
}

export function summarizeFeedback(rows: { import_id: string | null; shop: string | null; field: string; changed: boolean }[]): FeedbackSummary {
  const byImport = new Map<string, boolean>();
  const byField = new Map<string, { field: string; shop: string; compared: number; changed: number }>();
  for (const r of rows) {
    const key = r.import_id ?? `none:${r.shop}:${r.field}`;
    byImport.set(key, (byImport.get(key) ?? false) || r.changed);
    const shop = r.shop ?? "Other";
    const f = byField.get(`${shop}|${r.field}`) ?? { field: r.field, shop, compared: 0, changed: 0 };
    f.compared++;
    if (r.changed) f.changed++;
    byField.set(`${shop}|${r.field}`, f);
  }
  return {
    imports: byImport.size,
    untouched: [...byImport.values()].filter((changed) => !changed).length,
    fields: [...byField.values()].filter((f) => f.changed > 0).sort((a, b) => b.changed / b.compared - a.changed / a.compared || b.changed - a.changed),
  };
}
