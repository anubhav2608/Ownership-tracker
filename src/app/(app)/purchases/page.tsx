import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Wrench } from "lucide-react";
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
import type { Item, ServiceEvent } from "@/lib/types";
import { getItems, getOrders, getServiceEvents } from "@/lib/data";

export const metadata: Metadata = { title: "Purchases" };

const TYPES = [
  { value: "all", label: "All" },
  { value: "items", label: "Items" },
  { value: "services", label: "Services" },
] as const;
type PurchaseType = (typeof TYPES)[number]["value"];

async function PurchasesContent({ searchParams }: Pick<PageProps<"/purchases">, "searchParams">) {
  const requested = (await searchParams).type;
  const type: PurchaseType = TYPES.some((t) => t.value === requested) ? (requested as PurchaseType) : "all";
  const [orders, items, events] = await Promise.all([getOrders(), getItems(), getServiceEvents()]);
  // Everything paid for: orders of items, and services (whose records live under Services).
  const all = [
    ...orders.map((o) => ({ kind: "order" as const, date: o.orderDate, order: o })),
    ...events.map((e) => ({ kind: "service" as const, date: e.date, event: e })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const count = { all: all.length, items: orders.length, services: events.length };
  const sorted = all.filter((r) => type === "all" || (type === "items" ? r.kind === "order" : r.kind === "service"));

  return (
    <>
      {all.length > 0 && (
        <nav aria-label="Show" className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm">
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={t.value === "all" ? "/purchases" : `/purchases?type=${t.value}`}
              aria-current={type === t.value ? "page" : undefined}
              className={
                type === t.value
                  ? "rounded-md bg-card px-3 py-1 font-medium shadow-xs"
                  : "rounded-md px-3 py-1 text-muted-foreground hover:text-foreground"
              }
            >
              {t.label} <span className="text-xs text-muted-foreground tabular-nums">{count[t.value]}</span>
            </Link>
          ))}
        </nav>
      )}
      {sorted.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyCta
            icon={<Receipt />}
            title={all.length ? `No ${type === "items" ? "item orders" : "services"} yet` : "No purchases yet"}
            description="Upload an invoice or service bill, forward an order email or enter a purchase manually."
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Merchant</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden sm:table-cell">For</TableHead>
                <TableHead className="hidden lg:table-cell">Return by</TableHead>
                <TableHead className="hidden lg:table-cell">Warranty expires</TableHead>
                <TableHead className="hidden xl:table-cell">Source</TableHead>
                <TableHead className="pr-5 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                if (row.kind === "service") return <ServiceRow key={row.event.id} event={row.event} items={items} />;
                const o = row.order;
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

/** A service paid for: who did it, what, and what it cost; its record is under Services. */
function ServiceRow({ event: e, items }: { event: ServiceEvent; items: Item[] }) {
  const item = items.find((i) => i.id === e.itemId);
  return (
    <TableRow className="relative">
      <TableCell className="pl-5">
        <Link
          href={e.itemId ? `/items/${e.itemId}` : "/services"}
          className="inline-flex items-center gap-1.5 font-medium after:absolute after:inset-0"
        >
          <Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-label="Service" />
          {e.provider || "Service"}
        </Link>
        <div className="text-xs text-muted-foreground sm:hidden">
          {formatDate(e.date)} · {e.workPerformed}
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(e.date)}</TableCell>
      <TableCell className="hidden max-w-48 whitespace-normal sm:table-cell">
        <span className="line-clamp-2">
          {e.workPerformed}
          {item && <span className="text-muted-foreground"> · on {item.name}</span>}
        </span>
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">—</TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">—</TableCell>
      <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">Service</TableCell>
      <TableCell className="pr-5 text-right tabular-nums">{formatMoney(e.totalCost)}</TableCell>
    </TableRow>
  );
}

const earliest = (dates: (string | undefined)[]) =>
  dates.filter((d): d is string => Boolean(d)).sort()[0];

export default function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Everything you paid for: orders (one can hold several items) and services."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />
      <Suspense fallback={<ListCardSkeleton rows={5} />}>
        <PurchasesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
