"use client";

import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { formatMoney } from "@/lib/format";
import type { ServiceEvent } from "@/lib/types";

interface PartRow {
  key: number;
  name: string;
  cost: string;
}

let nextKey = 0;

export function ServiceEventDialog({
  itemId,
  event,
  showOdometer,
  onSave,
  onClose,
}: {
  itemId: string;
  event?: ServiceEvent;
  showOdometer: boolean;
  onSave: (event: ServiceEvent) => void;
  onClose: () => void;
}) {
  const [parts, setParts] = useState<PartRow[]>(
    event?.parts.map((p) => ({
      key: nextKey++,
      name: p.name,
      cost: p.cost?.toString() ?? "",
    })) ?? [],
  );
  const [labour, setLabour] = useState(event?.labourCost?.toString() ?? "");

  const partsTotal = parts.reduce((s, p) => s + (Number(p.cost) || 0), 0);
  const total = partsTotal + (Number(labour) || 0);

  function updatePart(key: number, patch: Partial<PartRow>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const odometer = data.get("odometer") as string | null;
    onSave({
      id: event?.id ?? crypto.randomUUID(),
      itemId,
      date: data.get("date") as string,
      provider: data.get("provider") as string,
      workPerformed: data.get("work") as string,
      parts: parts
        .filter((p) => p.name.trim())
        .map((p) => ({ name: p.name.trim(), cost: p.cost === "" ? undefined : Number(p.cost) })),
      labourCost: labour === "" ? undefined : Number(labour),
      totalCost: total,
      odometerKm: odometer ? Number(odometer) : undefined,
      notes: (data.get("notes") as string) || undefined,
      documentId: event?.documentId,
    });
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
            <Label htmlFor="work">Work performed</Label>
            <Input id="work" name="work" required defaultValue={event?.workPerformed} placeholder="e.g. Periodic service, brake pads replaced" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                defaultValue={event?.date ?? new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider">Provider</Label>
              <Input id="provider" name="provider" required defaultValue={event?.provider} placeholder="Service centre or technician" />
            </div>
            {showOdometer && (
              <div className="grid gap-2">
                <Label htmlFor="odometer">Odometer (km)</Label>
                <Input id="odometer" name="odometer" type="number" min="0" defaultValue={event?.odometerKm} />
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
              <Label htmlFor="labour">Labour cost</Label>
              <Input id="labour" type="number" min="0" value={labour} onChange={(e) => setLabour(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Total</span>
              <p className="flex h-9 items-center text-sm font-semibold tabular-nums">
                {formatMoney(total)}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={event?.notes} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
