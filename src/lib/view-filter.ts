import { CATEGORIES, type Category } from "@/lib/types";

// The dashboard's Expenses filters (period, category, merchant), carried in the
// links of its boxes so the page each opens shows the same records the box
// counted: /items, /purchases, /returns and /services read them from the URL.

export interface ViewFilter {
  merchant?: string;
  category?: Category;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** The filter in a page's search params; anything unrecognised is ignored. */
export function parseViewFilter(params: Record<string, string | string[] | undefined>): ViewFilter {
  const merchant = one(params.merchant)?.slice(0, 200);
  const category = one(params.category);
  const from = one(params.from);
  const to = one(params.to);
  return {
    merchant,
    category: CATEGORIES.includes(category as Category) ? (category as Category) : undefined,
    from: from && ISO_DATE.test(from) ? from : undefined,
    to: to && ISO_DATE.test(to) ? to : undefined,
  };
}

export const isFiltered = (f: ViewFilter) => Boolean(f.merchant || f.category || f.from || f.to);

/** A link to `path` showing what `f` covers (plus any `extra` params, such as ?type=items). */
export function filteredHref(path: string, f: ViewFilter, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra);
  if (f.merchant) q.set("merchant", f.merchant);
  if (f.category) q.set("category", f.category);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Whether a day (YYYY-MM-DD) is in the filter's period. */
export const inPeriod = (f: ViewFilter, day: string | undefined) =>
  !f.from && !f.to ? true : Boolean(day) && (!f.from || day! >= f.from) && (!f.to || day! <= f.to);

/** Whether a name (a merchant, or a service's provider) is the filter's merchant. */
export const isMerchant = (f: ViewFilter, name: string | undefined) => !f.merchant || name === f.merchant;

/** Whether a category is the filter's. */
export const isCategory = (f: ViewFilter, c: Category | undefined) => !f.category || c === f.category;

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** "Croma · Electronics · 1 Nov 2026 – 30 Nov 2026", for the banner on a filtered page. */
export function describeFilter(f: ViewFilter): string {
  const period =
    f.from && f.to ? `${day(f.from)} – ${day(f.to)}` : f.from ? `from ${day(f.from)}` : f.to ? `until ${day(f.to)}` : "";
  return [f.merchant, f.category, period].filter(Boolean).join(" · ");
}
