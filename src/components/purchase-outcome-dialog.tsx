"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatMoney } from "@/lib/format";
import { recordPurchaseOutcome, setOrderRefund } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Order } from "@/lib/types";

type Outcome = "returned" | "cancelled";

export interface OutcomeItem {
  id: string;
  name: string;
  price: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Marks a purchase, or some of its items, returned or cancelled, with the money
 * that came back. The refund starts at the chosen items' prices (the rest of the
 * total when every item is chosen) and can be changed, or 0 if it's still to come.
 */
export function PurchaseOutcomeDialog({
  order,
  items,
  chosen: initialChosen,
  outcome: initialOutcome = "returned",
  othersKept = 0,
  open,
  onOpenChange,
}: {
  order: Pick<Order, "id" | "total" | "refundedAmount">;
  /** The order's items still owned: the ones that can be returned. */
  items: OutcomeItem[];
  /** Ticked to begin with; all of them when left out. */
  chosen?: string[];
  outcome?: Outcome;
  /** Owned items of the order not offered here (from an item's own page). */
  othersKept?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fid = useId();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [chosen, setChosen] = useState<Set<string>>(new Set(initialChosen ?? items.map((i) => i.id)));
  const [typed, setTyped] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const left = round(Math.max(0, order.total - (order.refundedAmount ?? 0)));
  const everything = othersKept === 0 && (items.length === 0 || chosen.size === items.length);
  const suggested = everything
    ? left
    : Math.min(left, round(items.filter((i) => chosen.has(i.id)).reduce((sum, i) => sum + (i.price ?? 0), 0)));
  const refund = typed ?? String(suggested);
  const amount = Number(refund);
  const valid = refund.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= left;
  const verb = outcome === "returned" ? "Returned" : "Cancelled";

  function toggle(id: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || (items.length > 0 && chosen.size === 0)) return;
    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await recordPurchaseOutcome({
        orderId: order.id,
        // Always the items by name, so ones returned earlier keep their status.
        itemIds: [...chosen],
        outcome,
        refund: amount,
      });
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    const what = items.length === 0 || everything ? "Purchase" : `${chosen.size} item${chosen.size === 1 ? "" : "s"}`;
    toast.success(`${what} marked ${verb.toLowerCase()}${amount > 0 ? `, ${formatMoney(amount)} back` : ""}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Return or cancel</DialogTitle>
            <DialogDescription>
              Returned and cancelled items leave your owned items, and money back comes off what you spent.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">What happened?</legend>
            <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)} className="grid grid-cols-2 gap-2">
              {(["returned", "cancelled"] as const).map((o) => (
                <Label
                  key={o}
                  htmlFor={`${fid}-${o}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
                >
                  <RadioGroupItem id={`${fid}-${o}`} value={o} />
                  {o === "returned" ? "Returned" : "Cancelled"}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          {items.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Which items?</legend>
              <ul className="divide-y rounded-lg border">
                {items.map((i) => (
                  <li key={i.id}>
                    <Label htmlFor={`${fid}-item-${i.id}`} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal">
                      <Checkbox
                        id={`${fid}-item-${i.id}`}
                        checked={chosen.has(i.id)}
                        onCheckedChange={(on) => toggle(i.id, on === true)}
                      />
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {i.price !== null ? formatMoney(i.price) : "—"}
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
              {chosen.size === 0 && <p className="text-xs text-destructive">Choose at least one item.</p>}
            </fieldset>
          )}

          <div className="grid gap-2">
            <Label htmlFor={`${fid}-refund`}>Money back</Label>
            <Input
              id={`${fid}-refund`}
              type="number"
              inputMode="decimal"
              min="0"
              max={left}
              step="0.01"
              value={refund}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={!valid}
            />
            <p className="text-xs text-muted-foreground">
              {valid
                ? `Enter 0 if the refund hasn't arrived yet${outcome === "cancelled" ? " or you were never charged" : ""}. You can change it later.`
                : `Between ₹0 and ${formatMoney(left)}.`}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !valid || (items.length > 0 && chosen.size === 0)}>
              {saving ? "Saving…" : `Mark ${verb.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Corrects the money back on a purchase: it came in lower, later, or not at all. */
export function RefundDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Pick<Order, "id" | "total" | "refundedAmount">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fid = useId();
  const router = useRouter();
  const [value, setValue] = useState(String(order.refundedAmount ?? 0));
  const [saving, setSaving] = useState(false);
  const amount = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount <= order.total;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await setOrderRefund(order.id, amount);
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    toast.success(amount > 0 ? `Refund set to ${formatMoney(amount)}` : "Refund removed");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Edit refund</DialogTitle>
            <DialogDescription>All the money that came back for this purchase of {formatMoney(order.total)}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${fid}-amount`}>Total refunded</Label>
            <Input
              id={`${fid}-amount`}
              type="number"
              inputMode="decimal"
              min="0"
              max={order.total}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!valid}
            />
            {!valid && <p className="text-xs text-destructive">Between ₹0 and {formatMoney(order.total)}.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !valid}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
