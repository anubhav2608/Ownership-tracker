"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteItem, setItemStatus } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Item, ItemStatus } from "@/lib/types";
import { ItemEditDialog } from "./item-edit-dialog";

const statuses: { value: ItemStatus; label: string }[] = [
  { value: "owned", label: "Owned" },
  { value: "returned", label: "Returned" },
  { value: "sold", label: "Sold" },
  { value: "disposed", label: "Disposed" },
];

// In demo mode (no Supabase) actions only confirm with a toast.
export function ItemActions({ item }: { item: Item }) {
  const router = useRouter();
  const [current, setCurrent] = useState(item.status);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function changeStatus(value: string) {
    const status = value as ItemStatus;
    const previous = current;
    setCurrent(status);
    if (isSupabaseConfigured) {
      const result = await setItemStatus(item.id, status);
      if (!result.ok) {
        setCurrent(previous);
        return void toast.error(result.message);
      }
      router.refresh();
    }
    toast.success(`Marked as ${statuses.find((s) => s.value === status)?.label.toLowerCase()}`);
  }

  async function remove() {
    if (isSupabaseConfigured) {
      const result = await deleteItem(item.id);
      if (!result.ok) return void toast.error(result.message);
    }
    toast.success(`Deleted ${item.name}`);
    router.push("/items");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreHorizontal /> Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={changeStatus}>
            {statuses.map((s) => (
              <DropdownMenuRadioItem key={s.value} value={s.value}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 /> Delete item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing && <ItemEditDialog item={item} onClose={() => setEditing(false)} />}

      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${item.name}?`}
        description="Its warranty and service history are deleted too. The purchase and its documents stay."
        onConfirm={remove}
      />
    </>
  );
}
