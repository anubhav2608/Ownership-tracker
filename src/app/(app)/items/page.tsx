import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { getItems, getOrders, getServiceEvents } from "@/lib/mock-data";
import { ItemsList, type ItemRow } from "./items-list";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage() {
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
      <ItemsList rows={rows} />
    </>
  );
}
