import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { DemoAutostart } from "@/components/demo-autostart";

export const metadata: Metadata = {
  title: "Demo",
  description: "Open the Ownership demo: a private sandbox with a car owner's sample records. No sign-up.",
};

/**
 * The shareable demo link. Opening it starts the one-click demo (a private
 * sandbox with sample records, see ./actions.ts) without a second click.
 */
export default function DemoPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Opening the demo…</h1>
      <p className="text-muted-foreground">
        A private sandbox with sample records: a car with its warranty and service
        timeline, plus another purchase. It&rsquo;s deleted after a few days.
      </p>
      <DemoAutostart />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden />
        No sign-up, and no access to your inbox.
      </p>
      <Link href="/" className="text-sm font-medium text-primary">
        Back to the front page
      </Link>
    </main>
  );
}
