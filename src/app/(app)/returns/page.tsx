import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { EmptyCta } from "@/components/empty-cta";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getItems, getOrders } from "@/lib/data";
import { FilterBanner } from "@/components/filter-banner";
import { inPeriod, isFiltered, isMerchant, parseViewFilter } from "@/lib/view-filter";
import { ReturnsList } from "@/components/returns-list";
import { formatMoney } from "@/lib/format";
import { returnsFrom } from "@/lib/refunds";

export const metadata: Metadata = { title: "Returns & cancellations" };

// Everything that went back: returned and cancelled items, and refunds, with
// what came back and what is still to come.
async function ReturnsContent({ searchParams }: Pick<PageProps<"/returns">, "searchParams">) {
  // From a dashboard box: returns that happened in its period, for its merchant and category.
  const filter = parseViewFilter(await searchParams);
  const [orders, items] = await Promise.all([getOrders(), getItems()]);
  const entries = returnsFrom(orders, items).filter(
    (r) =>
      inPeriod(filter, r.date) &&
      isMerchant(filter, r.order.merchant) &&
      (!filter.category || r.items.some((i) => i.category === filter.category)),
  );
  const back = entries.reduce((s, e) => s + e.refunded, 0);
  const itemCount = entries.reduce((s, e) => s + e.items.length, 0);
  const waiting = entries.filter((e) => e.pending).length;

  return (
    <>
      <FilterBanner filter={filter} clearHref="/returns" what="returns and cancellations" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          { label: "Money back", value: formatMoney(back) },
          { label: "Items returned or cancelled", value: itemCount },
          { label: "Waiting for a refund", value: waiting },
        ].map((s) => (
          <Card key={s.label} className="gap-0 p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>
      <SectionCard title="All returns and cancellations">
        {entries.length === 0 ? (
          <EmptyCta
            icon={<RotateCcw />}
            title={isFiltered(filter) ? "None for these filters" : "No returns or cancellations"}
            description="Mark items returned or cancelled from their purchase, or upload or forward the refund email."
          />
        ) : (
          <ReturnsList entries={entries} />
        )}
      </SectionCard>
    </>
  );
}

export default function ReturnsPage({ searchParams }: PageProps<"/returns">) {
  return (
    <>
      <PageHeader
        title="Returns & cancellations"
        description="Returned and cancelled items, and the money that came back."
        action={
          <Button asChild>
            <Link href="/add">Add record</Link>
          </Button>
        }
      />
      <Suspense fallback={<ListCardSkeleton rows={4} />}>
        <ReturnsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
