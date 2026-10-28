"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceEvent, ServiceLineKind } from "@/lib/types";

interface PartRow {
  key: number;
  name: string;
  cost: string;
  /** Kept as read from the bill (service, fee); rows added here are parts. */
  kind?: ServiceLineKind;
}

let nextKey = 0;

export function ServiceEventDialog({
  itemId,
  event,
  showOdometer,
  onSave,
  onClose,
}: {
  /** Unset for a service on no item. */
  itemId?: string;
  event?: ServiceEvent;
  showOdometer: boolean;
  /** Resolves to true once saved; the dialog stays open on failure. */
  onSave: (event: ServiceEvent) => Promise<boolean>;
  onClose: () => void;
}) {
  const fid = useId();
  const [parts, setParts] = useState<PartRow[]>(
    event?.parts.map((p) => ({
      key: nextKey++,
      name: p.name,
      cost: p.cost?.toString() ?? "",
      kind: p.kind,
    })) ?? [],
  );
  const [labour, setLabour] = useState(event?.labourCost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const partsTotal = parts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
  const computedTotal = partsTotal + (Number(labour) || 0);
  // Receipts often include tax or fees, so keep a total that differs from parts + labour.
  const [totalOverride, setTotalOverride] = useState<string | null>(
    event && event.totalCost !== computedTotal ? String(event.totalCost) : null,
  );
  const total = totalOverride === null ? computedTotal : Number(totalOverride) || 0;

  function updatePart(key: number, patch: Partial<PartRow>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const odometer = data.get("odometer") as string | null;
    setSaving(true);
    const saved = await onSave({
      id: event?.id ?? crypto.randomUUID(),
      itemId,
      date: data.get("date") as string,
      provider: data.get("provider") as string,
      workPerformed: data.get("work") as string,
      parts: parts
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), cost: p.cost === "" ? undefined : Number(p.cost), kind: p.kind })),
      labourCost: labour === "" ? undefined : Number(labour),
      totalCost: total,
      odometerKm: odometer ? Number(odometer) : undefined,
      notes: (data.get("notes") as string) || undefined,
      documentId: event?.documentId,
    });
    if (!saved) setSaving(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{event ? "Edit service event" : "Add service event"}</DialogTitle>
            <DialogDescription>
              Record what was done, what was replaced, and what it cost.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${fid}-work`}>Work performed</Label>
            <Input id={`${fid}-work`} name="work" required defaultValue={event?.workPerformed} placeholder="e.g. Periodic service, brake pads replaced" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-date`}>Date</Label>
              <Input
                id={`${fid}-date`}
                name="date"
                type="date"
                required
                defaultValue={event?.date ?? new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-provider`}>Provider</Label>
              <Input id={`${fid}-provider`} name="provider" required defaultValue={event?.provider} placeholder="Service centre or technician" />
            </div>
            {showOdometer && (
              <div className="grid gap-2">
                <Label htmlFor={`${fid}-odometer`}>Odometer (km)</Label>
                <Input id={`${fid}-odometer`} name="odometer" type="number" min="0" defaultValue={event?.odometerKm} />
              </div>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Parts replaced</legend>
            {parts.map((p) => (
              <div key={p.key} className="flex gap-2">
                <Input
                  aria-label="Part name"
                  placeholder="Part"
                  value={p.name}
                  onChange={(e) => updatePart(p.key, { name: e.target.value })}
                />
                <Input
                  aria-label="Part cost"
                  placeholder="Cost"
                  type="number"
                  min="0"
                  className="w-28"
                  value={p.cost}
                  onChange={(e) => updatePart(p.key, { cost: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove part"
                  onClick={() => setParts((prev) => prev.filter((x) => x.key !== p.key))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setParts((prev) => [...prev, { key: nextKey++, name: "", cost: "" }])}
            >
              <Plus /> Add part
            </Button>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-labour`}>Labour cost</Label>
              <Input id={`${fid}-labour`} type="number" min="0" value={labour} onChange={(e) => setLabour(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-total`}>Total paid</Label>
              <Input
                id={`${fid}-total`}
                type="number"
                min="0"
                step="0.01"
                value={totalOverride ?? String(computedTotal)}
                onChange={(e) => setTotalOverride(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${fid}-notes`}>Notes</Label>
            <Textarea id={`${fid}-notes`} name="notes" rows={2} defaultValue={event?.notes} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
