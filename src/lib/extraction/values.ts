// Parsing amounts and dates the way they appear on Indian invoices.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Matches amounts like ₹1,24,900.00 · Rs. 649 · INR 29990 · 1,499.50 */
// Thousands are grouped Western (31,489) or Indian (1,24,900) style; other
// comma-separated numbers ("70/2,70/3" in an address) aren't amounts.
export const AMOUNT =
  /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,])/gi;

/** All amounts on a line, in order. */
export function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

/** Amounts written with a currency marker or two decimals, which are unlikely to be quantities or dates. */
export function moneyIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const raw = m[0].trim();
    if (/^(₹|rs|inr)/i.test(raw) || /\.\d{2}$/.test(m[1]) || m[1].includes(",")) {
      out.push(Number(m[1].replace(/,/g, "")));
    }
  }
  return out;
}

const NUMERIC_DATE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DAY_MONTH_NAME = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{2,4})\b/gi;
const MONTH_NAME_DAY = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;

function monthNumber(name: string): number | undefined {
  const k = name.toLowerCase();
  return MONTHS[k.slice(0, 4)] ?? MONTHS[k.slice(0, 3)];
}

function iso(y: number, m: number | undefined, d: number): string | null {
  if (!m) return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1990 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

/** First valid date in the text as YYYY-MM-DD. Numeric dates are read day-first, as in India. */
export function parseDate(text: string): string | null {
  const found: { index: number; value: string | null }[] = [];
  for (const m of text.matchAll(ISO_DATE)) found.push({ index: m.index, value: iso(+m[1], +m[2], +m[3]) });
  for (const m of text.matchAll(DAY_MONTH_NAME)) found.push({ index: m.index, value: iso(+m[3], monthNumber(m[2]), +m[1]) });
  for (const m of text.matchAll(MONTH_NAME_DAY)) found.push({ index: m.index, value: iso(+m[3], monthNumber(m[1]), +m[2]) });
  for (const m of text.matchAll(NUMERIC_DATE)) found.push({ index: m.index, value: iso(+m[3], +m[2], +m[1]) });
  return found.filter((f) => f.value).sort((a, b) => a.index - b.index)[0]?.value ?? null;
}
