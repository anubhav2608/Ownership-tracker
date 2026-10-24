"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { deleteImport } from "./actions";
import { documentKindLabel, ImportStatusBadge, SourceLabel } from "@/components/badges";
import { Card } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import type { ImportRecord, ImportStatus } from "@/lib/types";

const filters: { value: string; label: string; statuses?: ImportStatus[] }[] = [
  { value: "attention", label: "Needs you", statuses: ["needs_review", "failed"] },
  { value: "progress", label: "In progress", statuses: ["queued", "processing"] },
  { value: "done", label: "Imported", statuses: ["imported"] },
  { value: "skipped", label: "Skipped", statuses: ["duplicate", "unsupported"] },
  { value: "all", label: "All" },
];

export function ImportsList({ imports }: { imports: ImportRecord[] }) {
  const [filter, setFilter] = useState("attention");
  const count = (statuses?: ImportStatus[]) =>
    statuses ? imports.filter((r) => statuses.includes(r.status)).length : imports.length;
  const active = filters.find((f) => f.value === filter)!;
  const visible = active.statuses
    ? imports.filter((r) => active.statuses!.includes(r.status))
    : imports;

  return (
    <>
      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count(f.statuses)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Card className="gap-0 overflow-hidden py-0">
        {visible.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>Nothing here</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {visible.map((r) => (
              <li key={r.id} className="flex items-center hover:bg-accent">
                <Link
                  href={`/imports/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {summary(r)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <SourceLabel source={r.source} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.receivedAt)}
                      </span>
                      {r.documentKind && r.documentKind !== "other" && (
                        <span className="text-xs text-muted-foreground">
                          {documentKindLabel[r.documentKind]}
                        </span>
                      )}
                    </div>
                  </div>
                  <ImportStatusBadge status={r.status} />
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
                <DeleteImportButton record={r} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function DeleteImportButton({ record }: { record: ImportRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function remove() {
    if (isSupabaseConfigured && !(await deleteImport(record.id)).ok) {
      toast.error("Couldn't delete the import. Please try again.");
      return;
    }
    toast.success("Import deleted");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="mx-2 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Delete import ${record.title}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <ConfirmDelete
        open={open}
        onOpenChange={setOpen}
        title="Delete this import?"
        description={
          record.status === "imported"
            ? "Only the import record is removed. What it created stays, with the documents attached to it."
            : "The forwarded message or uploaded file is removed. No records were created from it."
        }
        onConfirm={remove}
      />
    </>
  );
}

function summary(r: ImportRecord) {
  switch (r.status) {
    case "failed":
      return r.error?.message;
    case "needs_review":
      return r.reviewReasons?.join(". ");
    case "duplicate":
      return "Already imported. Nothing new was created.";
    case "unsupported":
      return "Doesn't look like an order, invoice, refund or service receipt.";
    case "processing":
    case "queued":
      return "Working on it. This usually takes under a minute.";
    case "imported":
      return r.result?.serviceEventId
        ? "Added as a service event."
        : `Saved${r.result?.itemIds ? ` with ${r.result.itemIds.length} item${r.result.itemIds.length > 1 ? "s" : ""}` : ""}.`;
  }
}
