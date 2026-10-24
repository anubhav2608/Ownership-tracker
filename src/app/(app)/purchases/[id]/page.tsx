import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  CategoryIcon,
  FieldStateBadge,
  ItemStatusBadge,
  OrderStatusBadge,
  SourceLabel,
} from "@/components/badges";
import { DocumentList } from "@/components/document-list";
import { DetailRow, SectionCard } from "@/components/layout-bits";
import { DetailSkeleton } from "@/components/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDate, formatMoney } from "@/lib/format";
import { getDocuments, getImport, getItems, getOrder } from "@/lib/data";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Purchase" };

async function PurchaseDetail({ params }: Pick<PageProps<"/purchases/[id]">, "params">) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const [items, documents, source] = await Promise.all([
    getItems(),
    getDocuments(order.documentIds),
    order.importId ? getImport(order.importId) : undefined,
  ]);
  const orderItems = items.filter((i) => i.orderId === order.id);

  return (
    <>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{order.merchant}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{formatDate(order.orderDate)}</span>
            <SourceLabel source={order.source} />
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        <OrderActions order={order} itemCount={orderItems.length} />
      </div>

      {order.status !== "completed" && (
        <Alert className="mb-6">
          <RotateCcw />
          <AlertTitle>
            {formatMoney(order.refundedAmount ?? 0)} refunded
          </AlertTitle>
          <AlertDescription>
            Recorded from the refund notice. Items in this order were marked as returned.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Order details">
            <dl className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label="Merchant">{order.merchant}</DetailRow>
              {order.orderRef && (
                <DetailRow label="Order ref." mono>
                  {order.orderRef}
                </DetailRow>
              )}
              <DetailRow label="Date">{formatDate(order.orderDate)}</DetailRow>
              <DetailRow label="Total">{formatMoney(order.total)}</DetailRow>
              {source && (
                <div className="border-t pt-3 text-xs text-muted-foreground">
                  Imported from{" "}
                  <Link href={`/imports/${source.id}`} className="text-primary hover:underline">
                    {source.title}
                  </Link>
                </div>
              )}
            </dl>
          </SectionCard>

          <SectionCard title={`Documents (${documents.length})`}>
            <DocumentList documents={documents} />
          </SectionCard>
        </div>

        <SectionCard className="lg:col-span-2" title={`Items in this order (${orderItems.length})`}>
          <ul className="divide-y">
            {orderItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent"
                >
                  <CategoryIcon category={item.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.brand, item.model].filter(Boolean).join(" · ") || item.category}
                    </p>
                  </div>
                  {item.status !== "owned" && <ItemStatusBadge status={item.status} />}
                  {item.price.state === "extracted" && (
                    <span className="hidden sm:inline-flex">
                      <FieldStateBadge state="extracted" confidence={item.price.confidence} />
                    </span>
                  )}
                  <p className="text-right text-sm tabular-nums">
                    {item.price.value !== null ? formatMoney(item.price.value) : "—"}
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

export default function PurchasePage({ params }: PageProps<"/purchases/[id]">) {
  return (
    <>
      <Link
        href="/purchases"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Purchases
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <PurchaseDetail params={params} />
      </Suspense>
    </>
  );
}
