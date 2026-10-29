import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, FileText, Loader2, Mail, X } from "lucide-react";
import { documentKindLabel, ImportStatusBadge, Pill, SourceLabel } from "@/components/badges";
import { DocumentList } from "@/components/document-list";
import { RefreshButton } from "@/components/refresh-button";
import { DetailRow, SectionCard } from "@/components/layout-bits";
import { DetailSkeleton } from "@/components/skeletons";
import { formatDate } from "@/lib/format";
import { getImport, getImportDocuments, getItems, getOrders, getServiceEvents } from "@/lib/data";
import type { ImportRecord, ImportStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  DuplicatePanel,
  FailedPanel,
  ImportedPanel,
  ProcessingPanel,
  UnsupportedPanel,
} from "./status-panels";
import { RefundReview } from "./refund-review";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Import" };

const stages: { id: ImportStage; label: string }[] = [
  { id: "received", label: "Received" },
  { id: "verified", label: "Sender verified" },
  { id: "text_extracted", label: "Text extracted" },
  { id: "parsed", label: "Fields parsed" },
  { id: "validated", label: "Validated" },
  { id: "matched", label: "Matched to items" },
  { id: "saved", label: "Saved" },
];

async function ImportDetail({ params }: Pick<PageProps<"/imports/[id]">, "params">) {
  const { id } = await params;
  const record = await getImport(id);
  if (!record) notFound();

  const [items, orders, events, originals] = await Promise.all([
    getItems(),
    getOrders(),
    getServiceEvents(),
    getImportDocuments(record.id),
  ]);
  const ownedItems = items
    .filter((i) => i.status === "owned")
    .map((i) => ({ id: i.id, name: i.name, brand: i.brand }));
  const duplicateOf = record.duplicateOfId ? await getImport(record.duplicateOfId) : undefined;

  return (
    <>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight break-words">{record.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <ImportStatusBadge status={record.status} />
            {record.documentKind && record.documentKind !== "other" && (
              <Pill>{documentKindLabel[record.documentKind]}</Pill>
            )}
            {record.parser && (
              <Pill tone={record.parser === "llm" ? "info" : "neutral"}>
                {record.parser === "llm" ? "AI extraction" : "Known format"}
              </Pill>
            )}
          </div>
        </div>
        <RefreshButton />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {record.status === "needs_review" &&
            (record.documentKind === "refund_notice" ? (
              <RefundReview
                record={record}
                purchases={[...orders]
                  .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
                  .map((o) => ({
                    id: o.id,
                    merchant: o.merchant,
                    orderRef: o.orderRef,
                    orderDate: o.orderDate,
                    total: o.total,
                    refundedAmount: o.refundedAmount,
                    items: items
                      .filter((i) => i.orderId === o.id && i.status === "owned")
                      .map((i) => ({ id: i.id, name: i.name, price: i.price.value })),
                  }))}
              />
            ) : (
              <ReviewForm record={record} items={ownedItems} />
            ))}
          {(record.status === "processing" || record.status === "queued") && (
            <ProcessingPanel importId={record.id} status={record.status} />
          )}
          {record.status === "failed" && record.error && (
            <FailedPanel
              importId={record.id}
              error={record.error}
              attempts={record.attempts}
              from={record.from}
            />
          )}
          {record.status === "duplicate" && (
            <DuplicatePanel importId={record.id} duplicateOf={duplicateOf} />
          )}
          {record.status === "unsupported" && <UnsupportedPanel importId={record.id} reason={record.reviewReasons?.[0]} />}
          {record.status === "imported" && (
            <ImportedPanel
              record={record}
              orderMerchant={orders.find((o) => o.id === record.result?.orderId)?.merchant}
              createdItems={items.filter((i) => record.result?.itemIds?.includes(i.id))}
              serviceEvent={events.find((e) => e.id === record.result?.serviceEventId)}
              items={ownedItems}
            />
          )}
          {record.text && record.text.length > 0 && record.status !== "imported" && (
            <SectionCard title="Text we found">
              <details className="px-5 py-4 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Show the {record.text.length} lines read from this document
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                  {record.text.join("\n")}
                </pre>
              </details>
            </SectionCard>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title="Processing">
            <Pipeline record={record} />
          </SectionCard>

          <SectionCard title="Source">
            <dl className="space-y-3 px-5 py-4 text-sm">
              <DetailRow label="Via">
                <SourceLabel source={record.source} />
              </DetailRow>
              {record.from && <DetailRow label="From">{record.from}</DetailRow>}
              <DetailRow label="Received">{formatDate(record.receivedAt)}</DetailRow>
              <DetailRow label="Attempts">{record.attempts}</DetailRow>
              {record.parser && record.parser !== "llm" && (
                <DetailRow label="Template" mono>
                  {record.parser}
                </DetailRow>
              )}
            </dl>
            {originals.length > 0 ? (
              <div className="border-t">
                <DocumentList documents={originals} />
              </div>
            ) : (
              <div className="mx-5 mb-5 flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed bg-muted text-center text-sm text-muted-foreground">
                {record.source === "email" ? (
                  <Mail className="mb-2 size-7" strokeWidth={1.5} />
                ) : (
                  <FileText className="mb-2 size-7" strokeWidth={1.5} />
                )}
                Original {record.source === "email" ? "email" : "document"}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Pipeline({ record }: { record: ImportRecord }) {
  const reached = stages.findIndex((s) => s.id === record.stage);
  const failedAt = record.error ? stages.findIndex((s) => s.id === record.error!.stage) : -1;
  const stopped = record.status === "duplicate" || record.status === "unsupported";

  return (
    <ol className="space-y-2.5 px-5 py-4">
      {stages.map((s, i) => {
        let state: "done" | "current" | "failed" | "pending" | "skipped" = "pending";
        if (i === failedAt) state = "failed";
        else if (i <= reached) state = "done";
        else if (i === reached + 1 && record.status === "processing") state = "current";
        else if (stopped || failedAt >= 0) state = "skipped";
        if (record.status === "needs_review" && i === reached + 1) state = "current";

        return (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                state === "done" && "border-success bg-success text-primary-foreground",
                state === "failed" && "border-danger bg-danger text-primary-foreground",
                state === "current" && "border-primary text-primary",
              )}
            >
              {state === "done" && <Check className="size-3" />}
              {state === "failed" && <X className="size-3" />}
              {state === "current" &&
                (record.status === "processing" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-primary" />
                ))}
            </span>
            <span
              className={cn(
                state === "pending" || state === "skipped" ? "text-muted-foreground" : "",
                state === "failed" && "text-danger",
              )}
            >
              {s.id === "saved" && record.status === "needs_review" ? "Your review" : s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ImportPage({ params }: PageProps<"/imports/[id]">) {
  return (
    <>
      <Link
        href="/imports"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Imports
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <ImportDetail params={params} />
      </Suspense>
    </>
  );
}
