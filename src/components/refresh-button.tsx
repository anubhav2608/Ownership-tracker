"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fetches the page's data again (e.g. imports that arrived by email meanwhile). */
export function RefreshButton() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() => startRefresh(() => router.refresh())}
      disabled={refreshing}
      aria-label={refreshing ? "Refreshing" : "Refresh"}
    >
      <RotateCw className={cn(refreshing && "animate-spin")} />
      {/* Just the icon on a phone, where the header row is narrow. */}
      <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
    </Button>
  );
}
