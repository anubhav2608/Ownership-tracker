import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { getItems, getOrders, getServiceEvents } from "@/lib/data";
import { ItemsList, type ItemRow } from "./items-list";

export const metadata: Metadata = { title: "Items" };

async function ItemsContent() {
  const [items, orders, events] = await Promise.all([
    getItems(),
    getOrders(),
    getServiceEvents(),
  ]);

  const rows: ItemRow[] = items.map((item) => ({
    item,
    merchant: orders.find((o) => o.id === item.orderId)?.merchant,
    serviceCount: events.filter((e) => e.itemId === item.id).length,
  }));

  return <ItemsList rows={rows} />;
}

export default function ItemsPage() {
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
        <ItemsContent />
      </Suspense>
    </>
  );
}
