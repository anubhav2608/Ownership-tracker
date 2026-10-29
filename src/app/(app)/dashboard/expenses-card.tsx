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
import { MonthlyChart, type MonthTotals } from "./monthly-chart";

// What was spent, for a period (this month by default) and optionally one
// category or merchant: purchases (less refunds) plus maintenance, month by
// month and by category.

export interface ExpenseOrder {
  id: string;
  merchant: string;
  date: string;
  /** Total less refunds. */
  spent: number;
  /** What was paid before any refund. */
  total: number;
  /** When the latest return, cancellation or refund on it happened (YYYY-MM-DD). */
  backOn?: string;
  documentIds: string[];
}
export interface ExpenseItem {
  orderId?: string;
  category: Category;
  price: number | null;
  returned: boolean;
  /** When it was returned or cancelled (YYYY-MM-DD). */
  backOn?: string;
  owned: boolean;
  documentIds: string[];
}
export interface ExpenseEvent {
  date: string;
  cost: number;
  category?: Category;
  merchant?: string;
  documentIds: string[];
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

export function ExpensesCard({
  orders,
  items,
  events,
  documentIds,
  today,
}: {
  orders: ExpenseOrder[];
  /** Every stored document, so a link to one since deleted isn't counted. */
  documentIds: string[];
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

  // Shops and service providers: anyone money was paid to.
  const merchants = useMemo(
    () => [...new Set([...orders.map((o) => o.merchant), ...events.flatMap((e) => (e.merchant ? [e.merchant] : []))])].sort(),
    [orders, events],
  );
  const categories = useMemo(
    () => [...new Set([...items.map((i) => i.category), ...events.flatMap((e) => (e.category ? [e.category] : []))])].sort(),
    [items, events],
  );
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

    let purchases = 0;
    // Taken off for returns: refunds (and cancelled orders), or returned items' prices in one category.
    let returned = 0;
    if (category === "all") {
      // Whole orders: shipping and fees count too.
      for (const o of theOrders) {
        purchases += o.spent;
        returned += o.total - o.spent;
      }
    } else {
      for (const i of theItems.filter((i) => i.category === category)) purchases += i.price!;
      for (const i of items) {
        if (i.orderId && shownOrders.has(i.orderId) && i.returned && i.category === category) returned += i.price ?? 0;
      }
    }
    const maintenance = theEvents.reduce((s, e) => s + e.cost, 0);

    // The boxes: what the period, category and merchant cover.
    const inCategory = (c: Category) => category === "all" || c === category;
    const viewItems = items.filter((i) => i.orderId && shownOrders.has(i.orderId) && inCategory(i.category));

    // The Returns & cancellations box counts by when they happened, not when
    // the order was placed: a September order cancelled in October is October's.
    function returnsInPeriod() {
      const byMerchant = (o: ExpenseOrder) => merchant === "all" || o.merchant === merchant;
      const orderById = new Map(orders.map((o) => [o.id, o]));
      const back = items.filter((i) => {
        const o = i.orderId ? orderById.get(i.orderId) : undefined;
        return i.returned && i.backOn && inRange(i.backOn) && o && byMerchant(o) && inCategory(i.category);
      });
      const backAmount =
        category === "all"
          ? orders.filter((o) => o.backOn && inRange(o.backOn) && byMerchant(o)).reduce((s, o) => s + (o.total - o.spent), 0)
          : back.reduce((s, i) => s + (i.price ?? 0), 0);
      return { itemsBack: back.length, backAmount };
    }
    const viewOrders = category === "all" ? theOrders : theOrders.filter((o) => viewItems.some((i) => i.orderId === o.id));
    const stored = new Set(documentIds);
    const docs = new Set(
      [...viewOrders.flatMap((o) => o.documentIds), ...viewItems.flatMap((i) => i.documentIds), ...theEvents.flatMap((e) => e.documentIds)].filter(
        (d) => stored.has(d),
      ),
    );


    return {
      purchases,
      returned,
      maintenance,
      owned: viewItems.filter((i) => i.owned).length,
      ...returnsInPeriod(),
      documents: docs.size,
      orderCount: category === "all" ? theOrders.length : new Set(theItems.filter((i) => i.category === category).map((i) => i.orderId)).size,
    };
  }, [orders, items, events, documentIds, range, category, merchant]);

  // The last 12 months, whatever the period: purchases and services month by month,
  // for the chosen category and merchant.
  const monthly = useMemo<MonthTotals[]>(() => {
    const [y, m] = today.split("-").map(Number);
    const months = Array.from({ length: 12 }, (_, i) => iso(y, m - 12 + i, 1).slice(0, 7));
    const totals = new Map(months.map((ym) => [ym, { month: ym, purchases: 0, services: 0 }]));
    const at = (date: string) => totals.get(date.slice(0, 7));
    const byMerchant = (o: ExpenseOrder) => merchant === "all" || o.merchant === merchant;
    if (category === "all") {
      for (const o of orders) {
        const month = at(o.date);
        if (month && byMerchant(o)) month.purchases += o.spent;
      }
    } else {
      const orderById = new Map(orders.map((o) => [o.id, o]));
      for (const i of items) {
        const o = i.orderId ? orderById.get(i.orderId) : undefined;
        if (o && byMerchant(o) && i.category === category && !i.returned && i.price !== null && at(o.date)) at(o.date)!.purchases += i.price;
      }
    }
    for (const e of events) {
      if ((category === "all" || e.category === category) && (merchant === "all" || e.merchant === merchant) && at(e.date)) {
        at(e.date)!.services += e.cost;
      }
    }
    return [...totals.values()];
  }, [orders, items, events, category, merchant, today]);

  const total = result.purchases + result.maintenance;
  const periodLabel =
    preset === "custom"
      ? range.from || range.to
        ? `${range.from || "the start"} to ${range.to || "today"}`
        : "All time"
      : PRESETS.find((p) => p.value === preset)!.label;

  return (
    <SectionCard
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

      {/* What the filters above cover, at a glance. */}
      <div className="grid grid-cols-2 gap-3 border-b px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Items owned", value: result.owned, href: "/items" },
          { label: "Purchases", value: result.orderCount, href: "/purchases" },
          {
            label: "Returns & cancellations",
            value: formatMoney(result.backAmount),
            note: `${result.itemsBack} item${result.itemsBack === 1 ? "" : "s"} back`,
            href: "/returns",
          },
          { label: "Documents stored", value: result.documents },
          { label: "Maintenance recorded", value: formatMoney(result.maintenance), href: "/services" },
        ].map((s) => {
          const body = (
            <>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{s.value}</p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="rounded-lg border p-3 hover:bg-accent">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="rounded-lg border p-3">
              {body}
            </div>
          );
        })}
      </div>

      <div className="border-b px-5 py-4">
        <MonthlyChart months={monthly} />
      </div>

      <div className="p-5">
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
          {result.returned > 0 && (
            <p className="mt-1 text-xs text-success">
              {formatMoney(result.returned)} returned or cancelled, already taken off
            </p>
          )}
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
