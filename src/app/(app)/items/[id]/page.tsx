import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, ShieldCheck, ShieldQuestion } from "lucide-react";
import {
  CategoryIcon,
  FieldStateBadge,
  ItemStatusBadge,
  OrderStatusBadge,
  SourceLabel,
  WarrantyBadge,
  ReturnByBadge,
} from "@/components/badges";
import { DocumentList } from "@/components/document-list";
import { DetailRow, SectionCard } from "@/components/layout-bits";
import { DetailSkeleton } from "@/components/skeletons";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatMoney, fractionElapsed } from "@/lib/format";
import { getCurrentUser, getDocuments, getItem, getItems, getOrder, getServiceEvents } from "@/lib/data";
import { AttachDocuments } from "@/components/attach-documents";
import { ItemActions } from "./item-actions";
import { ServiceHistory } from "./service-history";
import { WarrantyActions } from "./warranty-actions";

export async function generateMetadata(props: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: (await getItem(id))?.name ?? "Item" };
}

async function ItemDetail({ params }: Pick<PageProps<"/items/[id]">, "params">) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const [order, documents, events, allItems, user] = await Promise.all([
    item.orderId ? getOrder(item.orderId) : undefined,
    getDocuments(item.documentIds),
    getServiceEvents(item.id),
    getItems(),
    getCurrentUser(),
  ]);
  const siblings = allItems.filter((i) => i.orderId === item.orderId && i.id !== item.id);
  const { warranty } = item;

  return (
    <>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <CategoryIcon category={item.category} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[item.brand, item.model].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ItemStatusBadge status={item.status} />
            <WarrantyBadge item={item} />
          </div>
        </div>
        <ItemActions item={item} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Purchase">
            <dl className="space-y-3 px-5 py-4 text-sm">
              {order && (
                <DetailRow label="Merchant">
                  <Link href={`/purchases/${order.id}`} className="text-primary hover:underline">
                    {order.merchant}
                  </Link>
                </DetailRow>
              )}
              <DetailRow label="Date">{formatDate(item.purchaseDate)}</DetailRow>
              {item.returnBy && (
                <DetailRow label="Return by">
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    {formatDate(item.returnBy)}
                    <ReturnByBadge item={item} />
                  </span>
                </DetailRow>
              )}
              <DetailRow label="Price">
                <span className="inline-flex items-center gap-2">
                  {item.price.state !== "confirmed" && (
                    <FieldStateBadge state={item.price.state} confidence={item.price.confidence} />
                  )}
                  {item.price.value !== null ? formatMoney(item.price.value) : "—"}
                </span>
              </DetailRow>
              {order?.orderRef && (
                <DetailRow label="Order ref." mono>
                  {order.orderRef}
                </DetailRow>
              )}
              {item.identifiers.map((idf) => (
                <DetailRow key={idf.label} label={idf.label} mono>
                  {idf.value}
                </DetailRow>
              ))}
              {order && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SourceLabel source={order.source} />
                  <OrderStatusBadge status={order.status} />
                </div>
              )}
              {siblings.length > 0 && (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  Same order:{" "}
                  {siblings.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <Link href={`/items/${s.id}`} className="text-primary hover:underline">
                        {s.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </dl>
          </SectionCard>

          <SectionCard
            title="Warranty"
            action={
              warranty && (
                <WarrantyActions itemId={item.id} purchaseDate={item.purchaseDate} warranty={warranty} />
              )
            }
          >
            <div className="px-5 py-4 text-sm">
              {warranty ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="size-4 text-success" />
                    <span className="font-medium">
                      {warranty.months} months, {warranty.provider}
                    </span>
                    <FieldStateBadge state={warranty.state} />
                  </div>
                  <Progress
                    className="mt-4 h-1.5"
                    value={
                      fractionElapsed(warranty.startsOn ?? item.purchaseDate, warranty.expiresOn) * 100
                    }
                    aria-label="Warranty period elapsed"
                  />
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{formatDate(warranty.startsOn ?? item.purchaseDate)}</span>
                    <span>Ends {formatDate(warranty.expiresOn)}</span>
                  </div>
                  {warranty.evidence && (
                    <p className="mt-4 flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <Info className="mt-px size-3.5 shrink-0" />
                      <span>Source: {warranty.evidence}</span>
                    </p>
                  )}
                </>
              ) : (
                <div className="flex gap-3">
                  <ShieldQuestion className="size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">No warranty on record</p>
                    <p className="mt-1 text-muted-foreground">
                      None of this item&rsquo;s documents mention a warranty. If it has one,
                      upload the warranty card or add it yourself.
                    </p>
                    <div className="mt-3">
                      <WarrantyActions itemId={item.id} purchaseDate={item.purchaseDate} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={`Documents (${documents.length})`}
            action={<AttachDocuments userId={user.id} target={{ itemId: item.id }} />}
          >
            <DocumentList documents={documents} />
          </SectionCard>

          {item.notes && (
            <SectionCard title="Notes">
              <p className="px-5 py-4 text-sm text-muted-foreground">{item.notes}</p>
            </SectionCard>
          )}
        </div>

        <div className="min-w-0 lg:col-span-2">
          <ServiceHistory
            initial={events}
            itemId={item.id}
            showOdometer={item.category === "Vehicle"}
          />
        </div>
      </div>
    </>
  );
}

export default function ItemPage({ params }: PageProps<"/items/[id]">) {
  return (
    <>
      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Items
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <ItemDetail params={params} />
      </Suspense>
    </>
  );
}
