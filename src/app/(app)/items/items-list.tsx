"use client";

import Link from "next/link";
import { Boxes, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryIcon, StatusBadge, WarrantyBadge } from "@/components/item-bits";
import { Card, EmptyState, inputClass } from "@/components/ui";
import { cn, formatDate, formatMoney } from "@/lib/format";
import type { Item } from "@/lib/types";

const filters = ["Active", "Past", "All"] as const;
type Filter = (typeof filters)[number];

export function ItemsList({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Active");
  const [category, setCategory] = useState("All");

  const categories = ["All", ...new Set(items.map((i) => i.category))];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "Active" && i.status !== "active") return false;
      if (filter === "Past" && i.status === "active") return false;
      if (category !== "All" && i.category !== category) return false;
      if (!q) return true;
      return [i.name, i.brand, i.model, i.purchase.merchant, i.serialNumber]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [items, query, filter, category]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, brand, merchant or serial number"
            className={cn(inputClass, "pl-9")}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  filter === f ? "bg-surface-2 font-medium" : "text-muted",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={cn(inputClass, "w-auto")}
            aria-label="Category"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState icon={<Boxes className="size-6" />} title="No items match">
            Try a different search or filter.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2"
                >
                  <CategoryIcon category={item.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted">
                      {item.brand} · {item.purchase.merchant} · {formatDate(item.purchase.date)}
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    {item.services.length > 0 && (
                      <span className="text-xs text-muted">
                        {item.services.length} service{item.services.length > 1 && "s"}
                      </span>
                    )}
                    {item.status === "active" ? (
                      <WarrantyBadge item={item} />
                    ) : (
                      <StatusBadge status={item.status} />
                    )}
                  </div>
                  <p className="w-24 text-right text-sm tabular-nums">
                    {formatMoney(item.purchase.price)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
