"use client";

import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
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
export function OrderActions({ order, itemCount }: { order: Order; itemCount: number }) {
  const fid = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
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
              <Label htmlFor={`${fid}-orderRef`}>Order reference</Label>
              <Input id={`${fid}-orderRef`} name="orderRef" defaultValue={order.orderRef} />
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
