import type { Metadata } from "next";
import { Suspense } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getItems, getOrders } from "@/lib/data";
import { ReturnsList } from "@/components/returns-list";
import { formatMoney } from "@/lib/format";
import { returnsFrom } from "@/lib/refunds";

export const metadata: Metadata = { title: "Returns & cancellations" };

// Everything that went back: returned and cancelled items, and refunds, with
// what came back and what is still to come.
async function ReturnsContent() {
  const [orders, items] = await Promise.all([getOrders(), getItems()]);
  const entries = returnsFrom(orders, items);
  const back = entries.reduce((s, e) => s + e.refunded, 0);
  const itemCount = entries.reduce((s, e) => s + e.items.length, 0);
  const waiting = entries.filter((e) => e.pending).length;

  return (
    <>
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
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RotateCcw />
              </EmptyMedia>
              <EmptyTitle>No returns or cancellations</EmptyTitle>
              <EmptyDescription>
                Mark items returned or cancelled from their purchase, or forward the refund email.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ReturnsList entries={entries} />
        )}
      </SectionCard>
    </>
  );
}

export default function ReturnsPage() {
  return (
    <>
      <PageHeader
        title="Returns & cancellations"
        description="Returned and cancelled items, and the money that came back."
      />
      <Suspense fallback={<ListCardSkeleton rows={4} />}>
        <ReturnsContent />
      </Suspense>
    </>
  );
}
