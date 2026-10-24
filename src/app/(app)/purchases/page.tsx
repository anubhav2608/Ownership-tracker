import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Suspense } from "react";
import { OrderStatusBadge, SourceLabel } from "@/components/badges";
import { Deadline, RETURN_SOON_DAYS, WARRANTY_SOON_DAYS } from "@/components/deadline";
import { EmptyCta } from "@/components/empty-cta";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
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
import { getItems, getOrders } from "@/lib/data";

export const metadata: Metadata = { title: "Purchases" };

async function PurchasesContent() {
  const [orders, items] = await Promise.all([getOrders(), getItems()]);
  const sorted = [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return (
    <>
      {sorted.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyCta
            icon={<Receipt />}
            title="No purchases yet"
            description="Upload an invoice, forward an order email or enter a purchase manually."
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Merchant</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden sm:table-cell">Items</TableHead>
                <TableHead className="hidden lg:table-cell">Return by</TableHead>
                <TableHead className="hidden lg:table-cell">Warranty expires</TableHead>
                <TableHead className="hidden xl:table-cell">Source</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((o) => {
                const orderItems = items.filter((i) => i.orderId === o.id);
                // The deadlines that matter first: the earliest across the order's owned items.
                const owned = orderItems.filter((i) => i.status === "owned");
                const returnBy = earliest(owned.map((i) => i.returnBy));
                const warrantyEnds = earliest(owned.map((i) => i.warranty?.expiresOn));
                const several = (dates: (string | undefined)[]) => new Set(dates.filter(Boolean)).size > 1;
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
                      {(returnBy || warrantyEnds) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs lg:hidden">
                          {returnBy && <Deadline label="Return by" iso={returnBy} soonDays={RETURN_SOON_DAYS} />}
                          {warrantyEnds && (
                            <Deadline label="Warranty till" iso={warrantyEnds} soonDays={WARRANTY_SOON_DAYS} />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatDate(o.orderDate)}
                    </TableCell>
                    <TableCell className="hidden max-w-48 whitespace-normal sm:table-cell">
                      <span className="line-clamp-2">
                        {orderItems.map((i) => i.name).join(", ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {returnBy ? (
                        <>
                          <Deadline stacked iso={returnBy} soonDays={RETURN_SOON_DAYS} />
                          {several(owned.map((i) => i.returnBy)) && (
                            <div className="text-xs text-muted-foreground">earliest of its items</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {warrantyEnds ? (
                        <>
                          <Deadline stacked iso={warrantyEnds} soonDays={WARRANTY_SOON_DAYS} />
                          {several(owned.map((i) => i.warranty?.expiresOn)) && (
                            <div className="text-xs text-muted-foreground">first to expire</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
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
      )}
    </>
  );
}

const earliest = (dates: (string | undefined)[]) =>
  dates.filter((d): d is string => Boolean(d)).sort()[0];

export default function PurchasesPage() {
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
      <Suspense fallback={<ListCardSkeleton rows={5} />}>
        <PurchasesContent />
      </Suspense>
    </>
  );
}
