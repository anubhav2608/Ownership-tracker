"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mail, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { sendSampleInvoice } from "@/app/demo/actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";

/**
 * Shown while someone is in the demo: what this is, the journey to try
 * (forward a service invoice, review it, see the timeline) and a way to sign up.
 */
export function DemoBanner({ carHref, forwardingAddress }: { carHref?: string; forwardingAddress?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function forward() {
    setBusy(true);
    const result = await sendSampleInvoice();
    if (!result.ok) {
      setBusy(false);
      return void toast.error(result.message);
    }
    router.push(`/imports/${result.importId}`);
  }

  return (
    <div className="border-b bg-linear-to-r from-accent via-card to-info-soft px-4 py-3 md:px-8" role="region" aria-label="Demo">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
        <p className="flex min-w-0 flex-1 basis-72 items-start gap-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium">You&rsquo;re in a demo</span> with a car owner&rsquo;s sample records. Try the
            journey: forward a service invoice, check what we read, and watch it join the car&rsquo;s timeline.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={forward} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Mail />}
            {busy ? "Reading it…" : "Forward a sample service invoice"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/add?tab=upload">
              <Upload /> Upload your own invoice
            </Link>
          </Button>
          {carHref && (
            <Button asChild size="sm" variant="outline">
              <Link href={carHref}>
                The car&rsquo;s timeline <ArrowRight />
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href="/login?mode=signup">Create your account</Link>
          </Button>
        </div>
        {forwardingAddress && (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Or forward a real invoice email to your demo address:</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{forwardingAddress}</code>
            <CopyButton value={forwardingAddress} label="Copy" />
            <span className="text-xs text-muted-foreground">
              The first email from a new sender waits under Imports until you press &ldquo;Trust this sender&rdquo;.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
