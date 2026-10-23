"use client";

import { FileText, MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SectionCard } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatMoney } from "@/lib/format";
import type { ServiceEvent } from "@/lib/types";
import { ServiceEventDialog } from "./service-event-dialog";

// Local state only for the prototype; saving goes to Supabase later.
export function ServiceHistory({
  initial,
  itemId,
  showOdometer,
}: {
  initial: ServiceEvent[];
  itemId: string;
  showOdometer: boolean;
}) {
  const [events, setEvents] = useState(initial);
  const [editing, setEditing] = useState<ServiceEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<ServiceEvent | null>(null);

  const newestFirst = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const total = events.reduce((s, e) => s + e.totalCost, 0);
  const partsTotal = events.reduce(
    (s, e) => s + e.parts.reduce((p, part) => p + (part.cost ?? 0), 0),
    0,
  );

  function save(event: ServiceEvent) {
    setEvents((prev) =>
      prev.some((e) => e.id === event.id)
        ? prev.map((e) => (e.id === event.id ? event : e))
        : [...prev, event],
    );
    toast.success(editing === "new" ? "Service event added" : "Service event updated");
    setEditing(null);
  }

  return (
    <SectionCard
      title="Service history"
      action={
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add event
        </Button>
      }
    >
      {events.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wrench />
            </EmptyMedia>
            <EmptyTitle>No service recorded</EmptyTitle>
            <EmptyDescription>
              Add repairs, servicing and installations, or forward the service receipt.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <dl className="grid grid-cols-3 divide-x border-b text-center">
            <Stat label="Visits" value={String(events.length)} />
            <Stat label="Total recorded" value={formatMoney(total)} />
            <Stat label="Of which parts" value={formatMoney(partsTotal)} />
          </dl>

          {events.length > 1 && <CostPerVisit events={events} />}

          <ol className="px-5 py-5">
            {newestFirst.map((e, i) => (
              <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                {i < newestFirst.length - 1 && (
                  <span className="absolute top-9 bottom-0 left-[17px] w-px bg-border" />
                )}
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card">
                  <Wrench className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm font-medium">{e.workPerformed}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(e.date)} · {e.provider}
                        {e.odometerKm !== undefined &&
                          ` · ${e.odometerKm.toLocaleString("en-IN")} km`}
                      </p>
                    </div>
                    <p className="pt-1 text-sm font-medium tabular-nums">
                      {e.totalCost ? formatMoney(e.totalCost) : "Free"}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Event actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(e)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {(e.parts.length > 0 || e.labourCost !== undefined) && (
                    <table className="mt-3 w-full max-w-md text-xs">
                      <caption className="sr-only">Cost breakdown</caption>
                      <tbody className="text-muted-foreground">
                        {e.parts.map((p) => (
                          <tr key={p.name}>
                            <td className="py-0.5">{p.name}</td>
                            <td className="py-0.5 text-right tabular-nums">
                              {p.cost === undefined ? "—" : p.cost === 0 ? "Covered" : formatMoney(p.cost)}
                            </td>
                          </tr>
                        ))}
                        {e.labourCost !== undefined && (
                          <tr>
                            <td className="py-0.5">Labour</td>
                            <td className="py-0.5 text-right tabular-nums">{formatMoney(e.labourCost)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                  {e.notes && <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>}
                  {e.documentId && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="size-3.5" /> Receipt attached
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {editing && (
        <ServiceEventDialog
          key={editing === "new" ? "new" : editing.id}
          itemId={itemId}
          event={editing === "new" ? undefined : editing}
          showOdometer={showOdometer}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this service event?"
        description={deleting ? `${deleting.workPerformed}, ${formatDate(deleting.date)}.` : ""}
        onConfirm={() => {
          setEvents((prev) => prev.filter((e) => e.id !== deleting?.id));
          setDeleting(null);
          toast.success("Service event deleted");
        }}
      />
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** One horizontal bar per visit, oldest first, so costs read in order over time. */
function CostPerVisit({ events }: { events: ServiceEvent[] }) {
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...ordered.map((e) => e.totalCost), 1);

  return (
    <figure className="border-b px-5 py-4">
      <figcaption className="mb-3 text-xs font-medium text-muted-foreground">
        Cost per visit
      </figcaption>
      <ul className="space-y-2">
        {ordered.map((e) => (
          <li key={e.id} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {formatDate(e.date).replace(/^\d+ /, "")}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-5 items-center gap-2" tabIndex={0}>
                  {e.totalCost > 0 && (
                    <span
                      className="h-3 rounded-r-[4px] bg-primary"
                      style={{ width: `calc((100% - 4.5rem) * ${e.totalCost / max})` }}
                    />
                  )}
                  <span className="tabular-nums">
                    {e.totalCost ? formatMoney(e.totalCost) : "Free"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {e.workPerformed} · {formatDate(e.date)}
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </figure>
  );
}
