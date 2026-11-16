"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryImport } from "@/app/(app)/imports/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Reads a failed bill again without opening it. Sits beside a row's link, not inside it. */
export function RetryImportButton({ importId, className }: { importId: string; className?: string }) {
  const router = useRouter();
  const [reading, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={reading}
      aria-label="Retry reading this bill"
      onClick={() =>
        start(async () => {
          if (!isSupabaseConfigured) {
            toast.success("Retry queued");
            return;
          }
          const result = await retryImport(importId);
          if (!result.ok) toast.error(result.message);
          else if (result.status === "failed") toast.error("Still couldn't read it. Open it to see why.");
          else toast.success("Read. Open it to check the details.");
          router.refresh();
        })
      }
    >
      <RotateCw className={reading ? "animate-spin" : undefined} />
      {reading ? "Reading…" : "Retry"}
    </Button>
  );
}
