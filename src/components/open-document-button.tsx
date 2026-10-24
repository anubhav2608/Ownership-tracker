"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { getDocumentUrl } from "@/app/(app)/imports/actions";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function OpenDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const [pending, startTransition] = useTransition();

  function open() {
    if (!isSupabaseConfigured) {
      toast("Sample documents can't be opened in the demo");
      return;
    }
    // Open the tab synchronously so popup blockers allow it, then point it at the signed URL.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const url = await getDocumentUrl(id);
      if (url && tab) tab.location.href = url;
      else {
        tab?.close();
        toast.error("Couldn't open the file. Please try again.");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon" aria-label={`Open ${fileName}`} onClick={open} disabled={pending}>
      <Download />
    </Button>
  );
}
