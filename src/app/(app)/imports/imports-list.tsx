"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { deleteImport, deleteImports } from "./actions";
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

export function ImportsList({ imports: all }: { imports: ImportRecord[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("attention");
  // Deleted here: hidden at once, before the refreshed list arrives.
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const imports = all.filter((r) => !deleted.has(r.id));
  const count = (statuses?: ImportStatus[]) =>
    statuses ? imports.filter((r) => statuses.includes(r.status)).length : imports.length;
  const active = filters.find((f) => f.value === filter)!;
  const visible = active.statuses
    ? imports.filter((r) => active.statuses!.includes(r.status))
    : imports;
  const chosen = visible.filter((r) => selected.has(r.id));
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Hidden as soon as the delete is confirmed; the server can take a few
  // seconds for many rows. Put back any it couldn't delete.
  const rows = {
    hide(ids: string[]) {
      setDeleted((prev) => new Set([...prev, ...ids]));
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    },
    restore(ids: string[]) {
      if (ids.length) setDeleted((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    },
    refresh: () => router.refresh(),
  };

  return (
    <>
      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          setSelected(new Set());
        }}
        className="mb-4"
      >
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
        {visible.length > 0 && (
          <div className="flex min-h-12 items-center gap-3 border-b px-5 py-2">
            <Checkbox
              aria-label="Select all"
              checked={allChosen ? true : chosen.length ? "indeterminate" : false}
              onCheckedChange={(on) => setSelected(on === true ? new Set(visible.map((r) => r.id)) : new Set())}
            />
            <span className="text-sm text-muted-foreground">
              {chosen.length ? `${chosen.length} selected` : "Select all"}
            </span>
            {chosen.length > 0 && <DeleteSelected records={chosen} rows={rows} />}
          </div>
        )}
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
                <Checkbox
                  className="ml-5"
                  aria-label={`Select ${r.title}`}
                  checked={selected.has(r.id)}
                  onCheckedChange={(on) => toggle(r.id, on === true)}
                />
                <Link
                  href={`/imports/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-3"
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
                <DeleteImportButton record={r} rows={rows} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** What was saved from an import, which can be deleted with it. */
const savedKind = (r: ImportRecord) =>
  r.status !== "imported" ? undefined : r.result?.serviceEventId ? "service" : r.result?.orderId ? "purchase" : undefined;

interface Rows {
  hide: (ids: string[]) => void;
  restore: (ids: string[]) => void;
  refresh: () => void;
}

const plural = (n: number) => `${n} import${n === 1 ? "" : "s"}`;

function DeleteSelected({ records, rows }: { records: ImportRecord[]; rows: Rows }) {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [alsoSaved, setAlsoSaved] = useState(true);
  const saved = records.filter((r) => savedKind(r)).length;

  async function remove() {
    const ids = records.map((r) => r.id);
    rows.hide(ids);
    if (!isSupabaseConfigured) return void toast.success(`${plural(ids.length)} deleted`);
    const progress = toast.loading(`Deleting ${plural(ids.length)}…`);
    const failed = await deleteImports(ids, saved > 0 && alsoSaved).then(
      (r) => r.failed,
      () => ids,
    );
    rows.restore(failed);
    const done = ids.length - failed.length;
    if (failed.length) {
      toast.error(`Couldn't delete ${plural(failed.length)}. Please try again.`, { id: progress });
      if (done) toast.success(`${plural(done)} deleted`);
      rows.refresh();
    } else {
      toast.success(`${plural(done)} deleted`, { id: progress });
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
        <Trash2 /> Delete selected ({records.length})
      </Button>
      <ConfirmDelete
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${records.length} import${records.length === 1 ? "" : "s"}?`}
        description="Their forwarded messages and uploaded files are removed, unless a file is attached to something you kept."
        onConfirm={remove}
      >
        {saved > 0 && (
          <Label htmlFor={`${fid}-also`} className="flex items-center gap-2 text-sm font-normal">
            <Checkbox id={`${fid}-also`} checked={alsoSaved} onCheckedChange={(v) => setAlsoSaved(v === true)} />
            Also delete the {saved} purchase{saved === 1 ? "" : "s"} or service{saved === 1 ? "" : "s"} saved from them
          </Label>
        )}
      </ConfirmDelete>
    </>
  );
}

function DeleteImportButton({ record, rows }: { record: ImportRecord; rows: Rows }) {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const saved = savedKind(record);
  const [alsoSaved, setAlsoSaved] = useState(true);
  const withSaved = Boolean(saved) && alsoSaved;

  async function remove() {
    rows.hide([record.id]);
    if (isSupabaseConfigured && !(await deleteImport(record.id, withSaved).catch(() => ({ ok: false }))).ok) {
      rows.restore([record.id]);
      toast.error("Couldn't delete the import. Please try again.");
      return;
    }
    toast.success(withSaved ? `Import and its ${saved} deleted` : "Import deleted");
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
          withSaved
            ? `The ${saved} saved from it is deleted too, with its documents unless something else uses them.`
            : record.status === "imported"
              ? "Only the import record is removed. What it created stays, with the documents attached to it."
              : "The forwarded message or uploaded file is removed. No records were created from it."
        }
        onConfirm={remove}
      >
        {saved && (
          <Label htmlFor={`${fid}-also`} className="flex items-center gap-2 text-sm font-normal">
            <Checkbox id={`${fid}-also`} checked={alsoSaved} onCheckedChange={(v) => setAlsoSaved(v === true)} />
            Also delete the {saved} saved from it
          </Label>
        )}
      </ConfirmDelete>
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
