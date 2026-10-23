import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { InboxStatusBadge } from "@/components/inbox-bits";
import { SourceLabel } from "@/components/item-bits";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getInbox } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const inbox = await getInbox();
  const sorted = [...inbox].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Records we're processing, and ones that need a quick check before they're saved."
      />
      <Card>
        {sorted.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-6" />} title="Nothing to review" />
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((r) => {
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="truncate text-sm font-medium">{r.subject}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{r.reason}</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <SourceLabel source={r.source} />
                      <span className="text-xs text-muted">{formatDate(r.receivedAt)}</span>
                    </div>
                  </div>
                  <InboxStatusBadge status={r.status} />
                </>
              );
              return (
                <li key={r.id}>
                  {r.status === "processing" ? (
                    <div className="flex items-center gap-3 px-5 py-4 opacity-70">{content}</div>
                  ) : (
                    <Link
                      href={`/inbox/${r.id}`}
                      className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2"
                    >
                      {content}
                      <ArrowRight className="size-4 text-muted" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
