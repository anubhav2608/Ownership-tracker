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
import type { ItemStatus } from "@/lib/types";

const statuses: { value: ItemStatus; label: string }[] = [
  { value: "owned", label: "Owned" },
  { value: "returned", label: "Returned" },
  { value: "sold", label: "Sold" },
  { value: "disposed", label: "Disposed" },
];

// Prototype: actions update local state and confirm with a toast.
export function ItemActions({ itemName, status }: { itemName: string; status: ItemStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreHorizontal /> Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => toast("Editing opens the item form")}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={(v) => {
              setCurrent(v as ItemStatus);
              toast.success(`Marked as ${v}`);
            }}
          >
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

      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${itemName}?`}
        description="Its service history is deleted too. The purchase and its documents stay, so you can re-link them later."
        onConfirm={() => {
          toast.success(`Deleted ${itemName}`);
          router.push("/items");
        }}
      />
    </>
  );
}
