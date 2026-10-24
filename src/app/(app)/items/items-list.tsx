"use client";

import Link from "next/link";
import { Boxes, Search } from "lucide-react";
import { useState } from "react";
import { CategoryIcon, ItemStatusBadge, WarrantyBadge } from "@/components/badges";
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
          <ul className="divide-y">
            {visible.map(({ item, merchant: m, serviceCount }) => (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent"
                >
                  <CategoryIcon category={item.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.brand, m, formatDate(item.purchaseDate)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    {serviceCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {serviceCount} service{serviceCount > 1 && "s"}
                      </span>
                    )}
                    {item.status === "owned" ? (
                      <WarrantyBadge item={item} />
                    ) : (
                      <ItemStatusBadge status={item.status} />
                    )}
                  </div>
                  <p className="w-24 text-right text-sm tabular-nums">
                    {item.price.value !== null ? formatMoney(item.price.value) : "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        {visible.length} of {rows.length} items
      </p>
    </>
  );
}
