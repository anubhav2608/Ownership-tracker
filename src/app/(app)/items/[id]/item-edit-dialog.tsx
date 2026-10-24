"use client";

import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { updateItem } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CATEGORIES, type Category, type Item } from "@/lib/types";


interface IdentifierRow {
  key: number;
  label: string;
  value: string;
}

let nextKey = 0;

export function ItemEditDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const fid = useId();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [identifiers, setIdentifiers] = useState<IdentifierRow[]>(() =>
    item.identifiers.map((i) => ({ key: nextKey++, ...i })),
  );

  function updateIdentifier(key: number, patch: Partial<IdentifierRow>) {
    setIdentifiers((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const price = text("price");

    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await updateItem(item.id, {
        name: text("name"),
        brand: text("brand") || undefined,
        model: text("model") || undefined,
        category: text("category") as Category,
        purchaseDate: text("purchaseDate") || undefined,
        price: price === "" ? undefined : Number(price),
        identifiers: identifiers
          .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
          .filter((r) => r.label && r.value),
        notes: text("notes") || undefined,
      });
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      router.refresh();
    }
    toast.success("Item updated");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>Saved details are marked as confirmed by you.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${fid}-name`}>Name</Label>
            <Input id={`${fid}-name`} name="name" required defaultValue={item.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-brand`}>Brand</Label>
              <Input id={`${fid}-brand`} name="brand" defaultValue={item.brand} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-model`}>Model</Label>
              <Input id={`${fid}-model`} name="model" defaultValue={item.model} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-category`}>Category</Label>
              <NativeSelect id={`${fid}-category`} name="category" wrapperClassName="w-full" defaultValue={item.category}>
                {CATEGORIES.map((c) => (
                  <NativeSelectOption key={c}>{c}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-purchaseDate`}>Purchase date</Label>
              <Input id={`${fid}-purchaseDate`} name="purchaseDate" type="date" defaultValue={item.purchaseDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-price`}>Price</Label>
              <Input
                id={`${fid}-price`}
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={item.price.value ?? ""}
              />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Serial, registration and other numbers</legend>
            {identifiers.map((r) => (
              <div key={r.key} className="flex gap-2">
                <Input
                  aria-label="Identifier label"
                  placeholder="e.g. Serial no."
                  className="w-36"
                  value={r.label}
                  onChange={(e) => updateIdentifier(r.key, { label: e.target.value })}
                />
                <Input
                  aria-label="Identifier value"
                  placeholder="Value"
                  value={r.value}
                  onChange={(e) => updateIdentifier(r.key, { value: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove identifier"
                  onClick={() => setIdentifiers((prev) => prev.filter((x) => x.key !== r.key))}
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
              onClick={() =>
                setIdentifiers((prev) => [...prev, { key: nextKey++, label: "Serial no.", value: "" }])
              }
            >
              <Plus /> Add number
            </Button>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor={`${fid}-notes`}>Notes</Label>
            <Textarea id={`${fid}-notes`} name="notes" rows={2} defaultValue={item.notes} />
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
