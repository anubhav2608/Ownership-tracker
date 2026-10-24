"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, Search } from "lucide-react";
import { useState } from "react";
import { CategoryIcon, ItemStatusBadge } from "@/components/badges";
import { Deadline, RETURN_SOON_DAYS, WARRANTY_SOON_DAYS } from "@/components/deadline";
import { EmptyCta } from "@/components/empty-cta";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney } from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ItemRow {
  item: Item;
  merchant?: string;
  serviceCount: number;
}

type Scope = "owned" | "past" | "all";

export function ItemsList({ rows }: { rows: ItemRow[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("owned");
  const [category, setCategory] = useState("all");
  const [merchant, setMerchant] = useState("all");
  const [sort, setSort] = useState<Sort>({ column: "purchased", direction: "desc" });

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : // Deadlines read soonest first; dates and prices newest / highest first.
          { column, direction: column === "returnBy" || column === "warranty" ? "asc" : "desc" },
    );
  }

  const categories = [...new Set(rows.map((r) => r.item.category))].sort();
  const merchants = [...new Set(rows.map((r) => r.merchant).filter(Boolean))].sort() as string[];

  const q = query.trim().toLowerCase();
  const visible = rows.filter(({ item, merchant: m }) => {
    if (scope === "owned" && item.status !== "owned") return false;
    if (scope === "past" && item.status === "owned") return false;
    if (category !== "all" && item.category !== category) return false;
    if (merchant !== "all" && m !== merchant) return false;
    if (!q) return true;
    const haystack = [
      item.name,
      item.brand,
      item.model,
      m,
      ...item.identifiers.map((i) => i.value),
    ];
    return haystack.some((s) => s?.toLowerCase().includes(q));
  });

  const today = new Date().toLocaleDateString("en-CA");
  const sorted = [...visible].sort((a, b) => {
    const av = sortValue(a.item, sort.column, today);
    const bv = sortValue(b.item, sort.column, today);
    // Items without the value (no return date, no warranty) always go last.
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    const d = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.direction === "asc" ? d : -d;
  });

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand, merchant, serial or registration"
            className="pl-9"
            aria-label="Search items"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList>
              <TabsTrigger value="owned">Owned</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <NativeSelect
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          >
            <NativeSelectOption value="all">All categories</NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            aria-label="Merchant"
          >
            <NativeSelectOption value="all">All merchants</NativeSelectOption>
            {merchants.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {rows.length === 0 ? (
          <EmptyCta
            icon={<Boxes />}
            title="No items yet"
            description="Items appear here when you upload an invoice, forward a receipt or enter a purchase."
          />
        ) : visible.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Boxes />
              </EmptyMedia>
              <EmptyTitle>No items match</EmptyTitle>
              <EmptyDescription>Try a different search or filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div
              className="hidden border-b bg-muted/40 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_8.5rem_9rem_6.5rem] md:gap-4"
            >
              <span>Item</span>
              <SortHeader label="Purchased" column="purchased" sort={sort} onSort={toggleSort} />
              <SortHeader label="Return by" column="returnBy" sort={sort} onSort={toggleSort} />
              <SortHeader label="Warranty expires" column="warranty" sort={sort} onSort={toggleSort} />
              <SortHeader label="Price" column="price" sort={sort} onSort={toggleSort} align="right" />
            </div>
            <ul className="divide-y">
              {sorted.map(({ item, merchant: m, serviceCount }) => (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent md:grid md:grid-cols-[minmax(0,1fr)_7.5rem_8.5rem_9rem_6.5rem] md:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <CategoryIcon category={item.category} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{item.name}</span>
                          {item.status !== "owned" && <ItemStatusBadge status={item.status} />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            item.brand,
                            m,
                            serviceCount > 0 && `${serviceCount} service${serviceCount > 1 ? "s" : ""}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          <span className="md:hidden">
                            {[item.brand, m].some(Boolean) ? " · " : ""}
                            {formatDate(item.purchaseDate)}
                          </span>
                        </p>
                        {/* On phones the two dates sit under the name instead of in columns. */}
                        {(item.returnBy || item.warranty) && (
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs md:hidden">
                            {item.returnBy && (
                              <Deadline label="Return by" iso={item.returnBy} soonDays={RETURN_SOON_DAYS} active={item.status === "owned"} />
                            )}
                            {item.warranty && (
                              <Deadline
                                label="Warranty till"
                                iso={item.warranty.expiresOn}
                                soonDays={WARRANTY_SOON_DAYS}
                                active={item.status === "owned"}
                              />
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="hidden text-sm text-muted-foreground tabular-nums md:block">
                      {formatDate(item.purchaseDate)}
                    </span>
                    <span className="hidden text-sm md:block">
                      {item.returnBy ? (
                        <Deadline stacked iso={item.returnBy} soonDays={RETURN_SOON_DAYS} active={item.status === "owned"} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                    <span className="hidden text-sm md:block">
                      {item.warranty ? (
                        <Deadline stacked iso={item.warranty.expiresOn} soonDays={WARRANTY_SOON_DAYS} active={item.status === "owned"} />
                      ) : (
                        <span className="text-muted-foreground" title="No warranty on record">
                          —
                        </span>
                      )}
                    </span>
                    <p className="w-24 shrink-0 text-right text-sm tabular-nums md:w-auto">
                      {item.price.value !== null ? formatMoney(item.price.value) : "—"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        {visible.length} of {rows.length} items
      </p>
    </>
  );
}

type SortColumn = "purchased" | "returnBy" | "warranty" | "price";
type Sort = { column: SortColumn; direction: "asc" | "desc" };

/** Upcoming deadlines sort before ones that have passed, so "soonest first" means soonest still open. */
const deadlineKey = (iso: string | undefined, today: string) => (iso ? `${iso < today ? 1 : 0}${iso}` : null);

function sortValue(item: Item, column: SortColumn, today: string): string | number | null {
  switch (column) {
    case "purchased":
      return item.purchaseDate;
    case "returnBy":
      return deadlineKey(item.returnBy, today);
    case "warranty":
      return deadlineKey(item.warranty?.expiresOn, today);
    case "price":
      return item.price.value;
  }
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  sort: Sort;
  onSort: (c: SortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sort.column === column;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        align === "right" && "justify-self-end",
        active && "text-foreground",
      )}
    >
      {label}
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">
        {active ? `, sorted ${sort.direction === "asc" ? "ascending" : "descending"}` : ", sort"}
      </span>
    </button>
  );
}
