"use client";

import { Hammer, Plus, Search, Settings2, Wrench, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, inputClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { ServiceEvent, ServiceType } from "@/lib/types";

const typeMeta: Record<ServiceType, { label: string; icon: typeof Wrench }> = {
  repair: { label: "Repair", icon: Hammer },
  maintenance: { label: "Maintenance", icon: Wrench },
  installation: { label: "Installation", icon: Settings2 },
  inspection: { label: "Inspection", icon: Search },
};

// Local state only for the prototype; saving goes to Supabase later.
export function ServiceHistory({ initial }: { initial: ServiceEvent[] }) {
  const [events, setEvents] = useState(initial);
  const [adding, setAdding] = useState(false);

  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));
  const total = events.reduce((sum, e) => sum + (e.cost ?? 0), 0);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const cost = data.get("cost") as string;
    setEvents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        date: data.get("date") as string,
        type: data.get("type") as ServiceType,
        title: data.get("title") as string,
        provider: data.get("provider") as string,
        cost: cost ? Number(cost) : undefined,
        notes: (data.get("notes") as string) || undefined,
      },
    ]);
    setAdding(false);
  }

  return (
    <Card>
      <CardHeader
        title={
          <>
            Service history
            {events.length > 0 && (
              <span className="ml-2 font-normal text-muted">
                {events.length} event{events.length > 1 && "s"} · {formatMoney(total)} spent
              </span>
            )}
          </>
        }
        action={
          !adding && (
            <Button variant="secondary" className="h-8" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add event
            </Button>
          )
        }
      />

      {adding && (
        <form onSubmit={onSubmit} className="border-b border-line bg-surface-2/50 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">New service event</p>
            <button
              type="button"
              onClick={() => setAdding(false)}
              aria-label="Cancel"
              className="text-muted hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What was done" className="sm:col-span-2">
              <input name="title" required placeholder="e.g. Annual servicing" className={inputClass} />
            </Field>
            <Field label="Type">
              <select name="type" className={inputClass} defaultValue="maintenance">
                {Object.entries(typeMeta).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>
            <Field label="Done by">
              <input name="provider" required placeholder="Service centre or technician" className={inputClass} />
            </Field>
            <Field label="Cost">
              <input name="cost" type="number" min="0" placeholder="0" className={inputClass} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" rows={2} className={`${inputClass} h-auto py-2`} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit">Save event</Button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={<Wrench className="size-6" />} title="No service events yet">
          Add repairs, servicing and installations to keep a full history.
        </EmptyState>
      ) : (
        <ol className="px-5 py-4">
          {sorted.map((e, i) => {
            const { label, icon: Icon } = typeMeta[e.type];
            return (
              <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                {i < sorted.length - 1 && (
                  <span className="absolute top-9 bottom-0 left-[17px] w-px bg-line" />
                )}
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
                  <Icon className="size-4 text-muted" />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium">{e.title}</p>
                    <Badge>{label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(e.date)} · {e.provider}
                    {e.cost !== undefined && ` · ${e.cost === 0 ? "Free" : formatMoney(e.cost)}`}
                  </p>
                  {e.notes && <p className="mt-1.5 text-sm text-muted">{e.notes}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
