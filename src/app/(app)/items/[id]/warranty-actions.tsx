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
import { removeWarranty, saveWarranty } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Warranty } from "@/lib/types";

/** "Add warranty" when there is none; edit / remove buttons when there is one. */
export function WarrantyActions({
  itemId,
  purchaseDate,
  warranty,
}: {
  itemId: string;
  purchaseDate: string;
  warranty?: Warranty;
}) {
  const fid = useId();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await saveWarranty(itemId, {
        months: Number(form.get("months")),
        startsOn: String(form.get("startsOn")),
        provider: String(form.get("provider") ?? "").trim() || undefined,
      });
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    toast.success("Warranty saved");
    setEditing(false);
  }

  async function remove() {
    if (isSupabaseConfigured) {
      const result = await removeWarranty(itemId);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    toast.success("Warranty removed");
  }

  return (
    <>
      {warranty ? (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Edit warranty" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Remove warranty" onClick={() => setRemoving(true)}>
            <Trash2 />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Add warranty
        </Button>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{warranty ? "Edit warranty" : "Add warranty"}</DialogTitle>
              <DialogDescription>
                Saved as entered by you. Upload the warranty card to keep proof with it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${fid}-months`}>Length (months)</Label>
                <Input id={`${fid}-months`} name="months" type="number" min="1" max="600" required defaultValue={warranty?.months ?? 12} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${fid}-startsOn`}>Starts on</Label>
                <Input id={`${fid}-startsOn`} name="startsOn" type="date" required defaultValue={warranty?.startsOn ?? purchaseDate} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-provider`}>Provided by</Label>
              <Input id={`${fid}-provider`} name="provider" placeholder="Manufacturer or seller" defaultValue={warranty?.provider} />
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
        open={removing}
        onOpenChange={setRemoving}
        title="Remove this warranty?"
        description="The item and its documents stay; only the warranty details are removed."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </>
  );
}
