import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CheckCircle2, Receipt, Wrench } from "lucide-react";
import { ImportStatusBadge, OrderStatusBadge } from "@/components/badges";
import { EmptyCta } from "@/components/empty-cta";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { ListCardSkeleton, StatTilesSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ReturnsList } from "@/components/returns-list";
import { amountSpent, notKept, returnsFrom } from "@/lib/refunds";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getCurrentUser,
  getDocuments,
  getImports,
  getItems,
  getOrders,
  getServiceEvents,
} from "@/lib/data";
import { ExpensesCard } from "./expenses-card";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title={
          <Suspense fallback="Welcome back">
            <Greeting />
          </Suspense>
        }
        description="Your purchases, documents and service history in one place."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function Greeting() {
  const user = await getCurrentUser();
  return <>Hi, {user.name}</>;
}

function DashboardSkeleton() {
  return (
    <>
      <StatTilesSkeleton />
      <ListCardSkeleton rows={2} className="mt-6" />
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <ListCardSkeleton rows={3} className="lg:col-span-3" />
        <ListCardSkeleton rows={3} className="lg:col-span-2" />
      </div>
    </>
  );
}

async function DashboardContent() {
  const [items, orders, documents, events, imports] = await Promise.all([
    getItems(),
    getOrders(),
    getDocuments(),
    getServiceEvents(),
    getImports(),
  ]);

  const attention = imports.filter(
    (r) => r.status === "needs_review" || r.status === "failed",
  );
  const recentReturns = returnsFrom(orders, items).slice(0, 5);
  const recentOrders = [...orders]
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, 5);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const itemName = (id?: string) => items.find((i) => i.id === id)?.name;
  const orderItems = (orderId: string) => items.filter((i) => i.orderId === orderId);

  return (
    <>

      <ExpensesCard
        today={new Date().toLocaleDateString("en-CA")}
        orders={orders.map((o) => ({
          id: o.id,
          merchant: o.merchant,
          date: o.orderDate,
          spent: amountSpent(o),
          total: o.total,
          documentIds: o.documentIds,
        }))}
        documentIds={documents.map((d) => d.id)}
        items={items.map((i) => ({
          orderId: i.orderId,
          category: i.category,
          price: i.price.value,
          returned: notKept(i.status),
          owned: i.status === "owned",
          documentIds: i.documentIds,
        }))}
        events={events.map((e) => {
          const item = items.find((i) => i.id === e.itemId);
          return {
            date: e.date,
            cost: e.totalCost,
            // A service on no item (a home service booking) counts as Miscellaneous.
            category: item?.category ?? "Miscellaneous",
            // Who was paid for the service (Urban Company), not where the item was bought.
            merchant: e.provider || undefined,
            documentIds: e.documentId ? [e.documentId] : [],
          };
        })}
      />

      <SectionCard
        className="mt-6"
        title={`Imports needing you${attention.length ? ` (${attention.length})` : ""}`}
        action={
          <Link href="/imports" className="text-xs font-medium text-primary">
            All imports
          </Link>
        }
      >
        {attention.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2 />
              </EmptyMedia>
              <EmptyTitle>Nothing to review</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {attention.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/imports/${r.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.error?.message ?? r.reviewReasons?.[0]}
                    </p>
                  </div>
                  <ImportStatusBadge status={r.status} />
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <SectionCard
          className="lg:col-span-3"
          title="Recent purchases"
          action={
            <Link href="/purchases" className="text-xs font-medium text-primary">
              All purchases
            </Link>
          }
        >
          {recentOrders.length === 0 && (
            <EmptyCta
              icon={<Receipt />}
              title="No purchases yet"
              description="Upload an invoice or enter a purchase to start your history."
            />
          )}
          <ul className="divide-y">
            {recentOrders.map((o) => {
              const count = items.filter((i) => i.orderId === o.id).length;
              return (
                <li key={o.id}>
                  <Link
                    href={`/purchases/${o.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.merchant}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(o.orderDate)} · {count} item{count === 1 ? "" : "s"}
                      </p>
                      {orderItems(o.id).length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-foreground/80">
                          {orderItems(o.id)
                            .map((i) => i.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <OrderStatusBadge status={o.status} />
                    <p className="text-right text-sm tabular-nums">{formatMoney(amountSpent(o))}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard className="lg:col-span-2" title="Recent service">
          {recentEvents.length === 0 && (
            <EmptyCta
              icon={<Wrench />}
              title="No service recorded"
              description="Repairs and servicing show up here once you add them to an item."
              href="/add?tab=manual"
              action="Add a service event"
            />
          )}
          <ul className="divide-y">
            {recentEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={e.itemId ? `/items/${e.itemId}` : "/services"}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-accent"
                >
                  <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.workPerformed}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {itemName(e.itemId) || e.provider || "Service"} · {formatDate(e.date)}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    {e.totalCost ? formatMoney(e.totalCost) : "Free"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        className="mt-6"
        title="Recent returns"
        action={
          <Link href="/returns" className="text-xs font-medium text-primary">
            All returns
          </Link>
        }
      >
        {recentReturns.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nothing returned or refunded. Mark an item returned from its purchase, or forward the refund email.
          </p>
        ) : (
          <ReturnsList entries={recentReturns} />
        )}
      </SectionCard>
    </>
  );
}
