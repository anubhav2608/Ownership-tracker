"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const EVERY_MS = 20_000;

/**
 * Keeps the page current while it's open: checks whether imports changed
 * (a forwarded email arrived or finished reading) every 20 seconds, and when
 * the tab comes back into view, and if so fetches the page's data again. The
 * sidebar's count and the page itself update without a reload.
 */
export function LiveUpdates() {
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/imports/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (stopped || !version) return;
        // The first answer is what the page was rendered with.
        if (seen.current !== null && version !== seen.current) router.refresh();
        seen.current = version;
      } catch {
        // Offline for a moment: try again next time.
      }
    }
    check();
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  return null;
}
