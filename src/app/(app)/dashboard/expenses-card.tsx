"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { SectionCard } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatMoney } from "@/lib/format";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

// What was spent, for a period (this month by default) and optionally one
// category or merchant: purchases (less refunds) plus maintenance, month by
// month and by category.

export interface ExpenseOrder {
  id: string;
  merchant: string;
  date: string;
  /** Total less refunds. */
  spent: number;
}
export interface ExpenseItem {
  orderId?: string;
  category: Category;
  price: number | null;
  returned: boolean;
}
export interface ExpenseEvent {
  date: string;
  cost: number;
  category?: Category;
  merchant?: string;
}

type Preset = "month" | "last-month" | "3-months" | "year" | "all" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "3-months", label: "Last 3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** The date range a preset stands for, relative to today (YYYY-MM-DD). */
function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "month":
      return { from: iso(y, m - 1, 1), to: today };
    case "last-month":
      return { from: iso(y, m - 2, 1), to: iso(y, m - 1, 0) };
    case "3-months":
      return { from: iso(y, m - 3, 1), to: today };
    case "year":
      return { from: iso(y, 0, 1), to: today };
    default:
      return { from: "", to: "" };
  }
}

const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export function ExpensesCard({
  orders,
  items,
  events,
  today,
}: {
  orders: ExpenseOrder[];
  items: ExpenseItem[];
  events: ExpenseEvent[];
  /** Today on the server, so the default month matches what was rendered. */
  today: string;
}) {
  const fid = useId();
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => rangeFor("month", today));
  const [category, setCategory] = useState<Category | "all">("all");
  const [merchant, setMerchant] = useState("all");

  const merchants = useMemo(() => [...new Set(orders.map((o) => o.merchant))].sort(), [orders]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);
  const filtered = preset !== "month" || category !== "all" || merchant !== "all";

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") setRange(rangeFor(p, today));
  }
  function setDate(key: "from" | "to", value: string) {
    setPreset("custom");
    setRange((r) => ({ ...r, [key]: value }));
  }
  function reset() {
    choosePreset("month");
    setCategory("all");
    setMerchant("all");
  }

  const result = useMemo(() => {
    const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const theOrders = orders.filter((o) => inRange(o.date) && (merchant === "all" || o.merchant === merchant));
    const shownOrders = new Set(theOrders.map((o) => o.id));
    // Items of the orders in view; returned ones weren't kept, so they don't count.
    const theItems = items.filter((i) => i.orderId && shownOrders.has(i.orderId) && !i.returned && i.price !== null);
    const theEvents = events.filter(
      (e) =>
        inRange(e.date) &&
        (category === "all" || e.category === category) &&
        (merchant === "all" || e.merchant === merchant),
    );

    const byMonth = new Map<string, number>();
    const add = (date: string, amount: number) => byMonth.set(date.slice(0, 7), (byMonth.get(date.slice(0, 7)) ?? 0) + amount);

    let purchases = 0;
    if (category === "all") {
      // Whole orders: shipping and fees count too.
      for (const o of theOrders) {
        purchases += o.spent;
        add(o.date, o.spent);
      }
    } else {
      for (const i of theItems.filter((i) => i.category === category)) {
        purchases += i.price!;
        add(orderById.get(i.orderId!)!.date, i.price!);
      }
    }
    const maintenance = theEvents.reduce((s, e) => s + e.cost, 0);
    for (const e of theEvents) add(e.date, e.cost);

    const byCategory = new Map<Category, number>();
    for (const i of theItems) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.price!);

    return {
      purchases,
      maintenance,
      orderCount: category === "all" ? theOrders.length : new Set(theItems.filter((i) => i.category === category).map((i) => i.orderId)).size,
      months: [...byMonth].sort((a, b) => b[0].localeCompare(a[0])),
      categories: [...byCategory].sort((a, b) => b[1] - a[1]),
    };
  }, [orders, items, events, range, category, merchant]);

  const total = result.purchases + result.maintenance;
  const topMonth = Math.max(0, ...result.months.map((m) => m[1]));
  const topCategory = result.categories[0]?.[1] ?? 0;
  const periodLabel =
    preset === "custom"
      ? range.from || range.to
        ? `${range.from || "the start"} to ${range.to || "today"}`
        : "All time"
      : PRESETS.find((p) => p.value === preset)!.label;

  return (
    <SectionCard
      className="mt-6"
      title="Total expenses"
      action={
        filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> This month
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-end gap-3 border-b px-5 py-3">
        <Filter id={`${fid}-period`} label="Period">
          <NativeSelect id={`${fid}-period`} value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
            {PRESETS.map((p) => (
              <NativeSelectOption key={p.value} value={p.value}>
                {p.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Filter>
        <Filter id={`${fid}-from`} label="From">
          <Input
            id={`${fid}-from`}
            type="date"
            className="w-40"
            value={range.from}
            max={range.to || undefined}
            onChange={(e) => setDate("from", e.target.value)}
          />
        </Filter>
        <Filter id={`${fid}-to`} label="To">
          <Input
            id={`${fid}-to`}
            type="date"
            className="w-40"
            value={range.to}
            min={range.from || undefined}
            onChange={(e) => setDate("to", e.target.value)}
          />
        </Filter>
        <Filter id={`${fid}-category`} label="Category">
          <NativeSelect
            id={`${fid}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
          >
            <NativeSelectOption value="all">All categories</NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Filter>
        <Filter id={`${fid}-merchant`} label="Merchant">
          <NativeSelect id={`${fid}-merchant`} value={merchant} onChange={(e) => setMerchant(e.target.value)}>
            <NativeSelectOption value="all">All merchants</NativeSelectOption>
            {merchants.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Filter>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {periodLabel}
            {category !== "all" && ` · ${category}`}
            {merchant !== "all" && ` · ${merchant}`}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums" aria-live="polite">
            {formatMoney(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMoney(result.purchases)} on {result.orderCount} purchase{result.orderCount === 1 ? "" : "s"} ·{" "}
            {formatMoney(result.maintenance)} on maintenance
          </p>
          {total === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing spent in this period.{" "}
              {preset === "month" && (
                <button type="button" className="text-primary hover:underline" onClick={() => choosePreset("all")}>
                  Show all time
                </button>
              )}
            </p>
          )}

          {result.months.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Month by month</p>
              <ul className="space-y-2" aria-label="Spending by month">
                {result.months.map(([ym, value]) => (
                  <Bar key={ym} label={monthLabel(ym)} value={value} max={topMonth} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Purchases by category <span className="font-normal">(choose one to filter)</span>
          </p>
          {result.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No priced items in this period. <Link href="/items" className="text-primary hover:underline">See all items</Link>
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Purchases by category">
              {result.categories.map(([c, value]) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setCategory(category === c ? "all" : c)}
                    aria-pressed={category === c}
                    className={cn(
                      "w-full rounded-md px-2 py-1 text-left hover:bg-accent",
                      category === c && "bg-accent",
                      category !== "all" && category !== c && "opacity-50",
                    )}
                  >
                    <Bar label={c} value={value} max={topCategory} as="span" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Filter({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** One row of a single-series bar list: label, bar, amount (the amount is text, not color). */
function Bar({ label, value, max, as = "li" }: { label: string; value: number; max: number; as?: "li" | "span" }) {
  const Row = as;
  return (
    <Row
      className="group grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
      title={`${label}: ${formatMoney(value)}`}
    >
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2 rounded-full bg-muted">
        <span
          className="block h-2 rounded-full bg-primary transition-opacity group-hover:opacity-80"
          style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}
        />
      </span>
      <span className="text-right tabular-nums">{formatMoney(value)}</span>
    </Row>
  );
}
