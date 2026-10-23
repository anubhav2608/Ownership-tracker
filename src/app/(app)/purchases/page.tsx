import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, SourceLabel } from "@/components/badges";
import { PageHeader } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { getItems, getOrders } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const [orders, items] = await Promise.all([getOrders(), getItems()]);
  const sorted = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Orders from every retailer. One order can hold several items."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />
      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Merchant</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Items</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead className="pr-5 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((o) => {
              const orderItems = items.filter((i) => i.orderId === o.id);
              return (
                <TableRow key={o.id} className="relative">
                  <TableCell className="pl-5">
                    <Link
                      href={`/purchases/${o.id}`}
                      className="font-medium after:absolute after:inset-0"
                    >
                      {o.merchant}
                    </Link>
                    <div className="text-xs text-muted-foreground sm:hidden">
                      {formatDate(o.orderDate)} · {orderItems.length} item
                      {orderItems.length === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(o.orderDate)}
                  </TableCell>
                  <TableCell className="hidden max-w-48 whitespace-normal sm:table-cell">
                    <span className="line-clamp-2">
                      {orderItems.map((i) => i.name).join(", ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <SourceLabel source={o.source} />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular-nums">{formatMoney(o.total)}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
