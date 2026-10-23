import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, FileText, Mail } from "lucide-react";
import { InboxStatusBadge } from "@/components/inbox-bits";
import { SourceLabel } from "@/components/item-bits";
import { Badge, Card, CardHeader, LinkButton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getInboxRecord, getItems } from "@/lib/mock-data";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Review record" };

export default async function ReviewPage(props: PageProps<"/inbox/[id]">) {
  const { id } = await props.params;
  const record = await getInboxRecord(id);
  if (!record) notFound();

  const activeItems = (await getItems())
    .filter((i) => i.status === "active")
    .map((i) => ({ id: i.id, name: i.name }));

  return (
    <>
      <Link
        href="/inbox"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Inbox
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{record.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <InboxStatusBadge status={record.status} />
            <SourceLabel source={record.source} />
            <span className="text-xs text-muted">Received {formatDate(record.receivedAt)}</span>
            {record.parser && (
              <Badge tone={record.parser === "llm" ? "info" : "neutral"}>
                {record.parser === "llm" ? "AI extraction" : "Known format"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {record.status === "failed" ? (
        <Card className="max-w-xl p-6">
          <div className="flex gap-3">
            <AlertCircle className="size-5 shrink-0 text-danger" />
            <div>
              <p className="font-medium">We couldn&rsquo;t read this one</p>
              <p className="mt-1 text-sm text-muted">{record.reason}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <LinkButton href="/add?tab=upload">Upload again</LinkButton>
                <LinkButton href="/add?tab=manual" variant="secondary">
                  Enter manually
                </LinkButton>
                <LinkButton href="/inbox" variant="ghost">
                  Discard
                </LinkButton>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="order-2 lg:order-1">
            <CardHeader title="Original" />
            <div className="p-5">
              {/* Placeholder for the rendered email / document preview. */}
              <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface-2 text-center text-sm text-muted">
                {record.source === "email" ? (
                  <Mail className="mb-2 size-8" strokeWidth={1.5} />
                ) : (
                  <FileText className="mb-2 size-8" strokeWidth={1.5} />
                )}
                Document preview
                {record.from && <span className="mt-1 text-xs">From {record.from}</span>}
              </div>
            </div>
          </Card>

          <div className="order-1 lg:order-2">
            <div className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
              {record.reason}
            </div>
            <ReviewForm record={record} items={activeItems} />
          </div>
        </div>
      )}
    </>
  );
}
