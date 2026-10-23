import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Wrench } from "lucide-react";
import { ImportStatusBadge, OrderStatusBadge } from "@/components/badges";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getCurrentUser,
  getDocuments,
  getImports,
  getItems,
  getOrders,
  getServiceEvents,
} from "@/lib/mock-data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [user, items, orders, documents, events, imports] = await Promise.all([
    getCurrentUser(),
    getItems(),
    getOrders(),
    getDocuments(),
    getServiceEvents(),
    getImports(),
  ]);

  const owned = items.filter((i) => i.status === "owned");
  const maintenance = events.reduce((sum, e) => sum + e.totalCost, 0);
  const attention = imports.filter(
    (r) => r.status === "needs_review" || r.status === "failed",
  );
  const recentOrders = [...orders]
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, 5);
  const recentEvents = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name;

  const stats = [
    { label: "Items owned", value: owned.length, href: "/items" },
    { label: "Purchases", value: orders.length, href: "/purchases" },
    { label: "Documents stored", value: documents.length },
    { label: "Maintenance recorded", value: formatMoney(maintenance) },
  ];

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name}`}
        description="Your purchases, documents and service history in one place."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
            </>
          );
          return (
            <Card key={s.label} className="gap-0 p-4">
              {s.href ? (
                <Link href={s.href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </Card>
          );
        })}
      </div>

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
                    </div>
                    <OrderStatusBadge status={o.status} />
                    <p className="text-right text-sm tabular-nums">{formatMoney(o.total)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard className="lg:col-span-2" title="Recent service">
          <ul className="divide-y">
            {recentEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/items/${e.itemId}`}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-accent"
                >
                  <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.workPerformed}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {itemName(e.itemId)} · {formatDate(e.date)}
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
    </>
  );
}
