import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { InboxStatusBadge } from "@/components/inbox-bits";
import { CategoryIcon, StatusBadge, WarrantyBadge } from "@/components/item-bits";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { daysUntil, formatDate, formatMoney, relativeDays } from "@/lib/format";
import { getCurrentUser, getInbox, getItems, getReminders } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Dashboard" };

const reminderIcons = { warranty: ShieldCheck, return: RotateCcw, service: Wrench };

export default async function DashboardPage() {
  const [currentUser, items, inbox, reminders] = await Promise.all([
    getCurrentUser(),
    getItems(),
    getInbox(),
    getReminders(),
  ]);
  const getItem = (id: string) => items.find((i) => i.id === id);
  const active = items.filter((i) => i.status === "active");
  const covered = active.filter((i) => i.warranty && daysUntil(i.warranty.expiresOn) >= 0);
  const totalValue = active.reduce((sum, i) => sum + i.purchase.price, 0);
  const attention = inbox.filter((r) => r.status !== "processing");
  const upcoming = [...reminders]
    .filter((r) => daysUntil(r.dueOn) >= 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const recent = [...items]
    .sort((a, b) => b.purchase.date.localeCompare(a.purchase.date))
    .slice(0, 5);

  const stats = [
    { label: "Items owned", value: active.length },
    { label: "Under warranty", value: covered.length },
    { label: "Total value", value: formatMoney(totalValue) },
    { label: "Need your review", value: attention.length, warn: attention.length > 0 },
  ];

  return (
    <>
      <PageHeader
        title={`Hi, ${currentUser.name}`}
        description="Here's what needs your attention."
        action={<LinkButton href="/add">Add record</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted">{s.label}</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${s.warn ? "text-warn" : ""}`}
            >
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader
            title="Needs attention"
            action={
              <Link href="/inbox" className="text-xs font-medium text-accent">
                Open inbox
              </Link>
            }
          />
          {attention.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6" />} title="All caught up" />
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/inbox/${r.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.subject}</p>
                      <p className="truncate text-xs text-muted">{r.reason}</p>
                    </div>
                    <InboxStatusBadge status={r.status} />
                    <ArrowRight className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Coming up" />
          {upcoming.length === 0 ? (
            <EmptyState icon={<Bell className="size-6" />} title="No upcoming reminders" />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((r) => {
                const item = getItem(r.itemId);
                const Icon = reminderIcons[r.kind];
                const soon = daysUntil(r.dueOn) <= 7;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/items/${r.itemId}`}
                      className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-2"
                    >
                      <Icon className={`mt-0.5 size-4 ${soon ? "text-warn" : "text-muted"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.label}</p>
                        <p className="truncate text-xs text-muted">{item?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-medium ${soon ? "text-warn" : ""}`}>
                          {relativeDays(r.dueOn)}
                        </p>
                        <p className="text-xs text-muted">{formatDate(r.dueOn)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recently added"
          action={
            <Link href="/items" className="text-xs font-medium text-accent">
              All items
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {recent.map((item) => (
            <li key={item.id}>
              <Link
                href={`/items/${item.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2"
              >
                <CategoryIcon category={item.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted">
                    {item.purchase.merchant} · {formatDate(item.purchase.date)}
                  </p>
                </div>
                <div className="hidden sm:block">
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
      </Card>
    </>
  );
}
