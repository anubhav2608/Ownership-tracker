import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { FilterBanner } from "@/components/filter-banner";
import { getItems, getOrders, getServiceEvents } from "@/lib/data";
import { inPeriod, parseViewFilter } from "@/lib/view-filter";
import { ItemsList, type ItemRow } from "./items-list";

export const metadata: Metadata = { title: "Items" };

async function ItemsContent({ searchParams }: Pick<PageProps<"/items">, "searchParams">) {
  const filter = parseViewFilter(await searchParams);
  const [items, orders, events] = await Promise.all([
    getItems(),
    getOrders(),
    getServiceEvents(),
  ]);

  // From a dashboard box: the items of the purchases made in its period.
  const shown = items.filter((item) => inPeriod(filter, orders.find((o) => o.id === item.orderId)?.orderDate));
  const rows: ItemRow[] = shown.map((item) => ({
    item,
    order: orders.find((o) => o.id === item.orderId),
    merchant: orders.find((o) => o.id === item.orderId)?.merchant,
    serviceCount: events.filter((e) => e.itemId === item.id).length,
  }));

  return (
    <>
      <FilterBanner filter={filter} clearHref="/items" what="items bought" />
      <ItemsList
        key={JSON.stringify(filter)}
        rows={rows}
        initialCategory={filter.category ?? "all"}
        initialMerchant={filter.merchant ?? "all"}
      />
    </>
  );
}

export default function ItemsPage({ searchParams }: PageProps<"/items">) {
  return (
    <>
      <PageHeader
        title="Items"
        description="Everything you own, and everything you used to."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />
      <Suspense fallback={<ListCardSkeleton rows={5} />}>
        <ItemsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
