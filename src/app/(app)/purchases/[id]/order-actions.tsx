"use client";

import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { type OutcomeItem, PurchaseOutcomeDialog, RefundDialog } from "@/components/purchase-outcome-dialog";
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
import { deleteOrder, updateOrder } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Order } from "@/lib/types";

// In demo mode (no Supabase) actions only confirm with a toast.
export function OrderActions({
  order,
  itemCount,
  owned,
}: {
  order: Order;
  itemCount: number;
  /** Items of the order still owned, which can be returned or cancelled. */
  owned: OutcomeItem[];
}) {
  const fid = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await updateOrder(order.id, {
        merchant: text("merchant"),
        orderDate: text("orderDate"),
        orderRef: text("orderRef") || undefined,
        invoiceRef: text("invoiceRef") || undefined,
        total: text("total") === "" ? undefined : Number(text("total")),
      });
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    toast.success("Purchase updated");
    setEditing(false);
  }

  async function remove() {
    if (isSupabaseConfigured) {
      const result = await deleteOrder(order.id);
      if (!result.ok) return void toast.error(result.message);
    }
    toast.success("Purchase deleted");
    router.push("/purchases");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        {/* Nothing left to return once every item is returned or cancelled. */}
        {(owned.length > 0 || (itemCount === 0 && order.status !== "cancelled")) && (
          <Button variant="outline" onClick={() => setReturning(true)}>
            <RotateCcw /> Return or cancel
          </Button>
        )}
        <Button variant="outline" onClick={() => setConfirming(true)}>
          <Trash2 /> Delete
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Edit purchase</DialogTitle>
              <DialogDescription>
                Changing the date also updates items that used the old purchase date.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-merchant`}>Bought from</Label>
              <Input id={`${fid}-merchant`} name="merchant" required defaultValue={order.merchant} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${fid}-orderDate`}>Date</Label>
                <Input id={`${fid}-orderDate`} name="orderDate" type="date" required defaultValue={order.orderDate} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${fid}-total`}>Total paid</Label>
                <Input id={`${fid}-total`} name="total" type="number" min="0" step="0.01" defaultValue={order.total} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-orderRef`}>Order number</Label>
              <Input id={`${fid}-orderRef`} name="orderRef" defaultValue={order.orderRef} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-invoiceRef`}>Invoice number</Label>
              <Input id={`${fid}-invoiceRef`} name="invoiceRef" defaultValue={order.invoiceRef} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mounted only while open, so each opening starts from the current order. */}
      {returning && <PurchaseOutcomeDialog order={order} items={owned} open onOpenChange={setReturning} />}

      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete this ${order.merchant} purchase?`}
        description={`This deletes the purchase and its ${itemCount} item${itemCount === 1 ? "" : "s"}, with their warranties and service history, plus any documents that aren't attached to anything else. This can't be undone.`}
        onConfirm={remove}
      />
    </>
  );
}

/** "Edit refund", beside the refund on a purchase. */
export function EditRefundButton({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit refund
      </Button>
      {open && <RefundDialog order={order} open onOpenChange={setOpen} />}
    </>
  );
}
