"use client";

import Link from "next/link";
import { Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown while someone is in the demo: what this is, the journey to try
 * (upload a service invoice, review it, see the timeline) and a way to sign up.
 */
export function DemoBanner() {
  return (
    <div className="border-b bg-linear-to-r from-accent via-card to-info-soft px-4 py-3 md:px-8" role="region" aria-label="Demo">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
        <p className="flex min-w-0 flex-1 basis-72 items-start gap-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium">You&rsquo;re in a demo</span> with a car owner&rsquo;s sample records. Try the
            journey: upload a service invoice (a PDF or saved email), see what we read, and watch it join the car&rsquo;s timeline.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/add?tab=upload">
              <Upload /> Upload a service invoice
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
