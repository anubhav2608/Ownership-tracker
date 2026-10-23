// Single place to change locale and currency for the whole app.
const LOCALE = "en-IN";
const CURRENCY = "INR";

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatMoney(amount: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function daysUntil(iso: string, from: Date = new Date()) {
  const start = new Date(from.toDateString()).getTime();
  return Math.round((new Date(iso).getTime() - start) / DAY_MS);
}

/** Fraction (0–1) of the period from start to end that has passed. */
export function fractionElapsed(startIso: string, endIso: string, now: Date = new Date()) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function relativeDays(iso: string) {
  const d = daysUntil(iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
