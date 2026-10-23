"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Button } from "@/components/ui/button";

export function OrderActions({ merchant, itemCount }: { merchant: string; itemCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <Trash2 /> Delete purchase
      </Button>
      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete this ${merchant} purchase?`}
        description={`This deletes the order, its documents and its ${itemCount} item${itemCount === 1 ? "" : "s"}, including their service history. This can't be undone.`}
        onConfirm={() => {
          toast.success("Purchase deleted");
          router.push("/purchases");
        }}
      />
    </>
  );
}
