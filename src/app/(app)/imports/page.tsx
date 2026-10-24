import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ForwardingAddress } from "@/components/copy-button";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, getImports } from "@/lib/data";
import { ImportsList } from "./imports-list";

export const metadata: Metadata = { title: "Imports" };

async function ImportsContent() {
  const [user, imports] = await Promise.all([getCurrentUser(), getImports()]);
  const sorted = [...imports].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <>
      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm text-muted-foreground">Forward receipts to</p>
        <ForwardingAddress address={user.forwardingAddress} />
      </div>
      <ImportsList imports={sorted} />
    </>
  );
}

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Imports"
        description="Every forwarded email and upload, what we did with it, and anything that needs you."
        action={
          <Button asChild variant="outline">
            <Link href="/add?tab=upload">Upload</Link>
          </Button>
        }
      />
      <Suspense fallback={<ImportsSkeleton />}>
        <ImportsContent />
      </Suspense>
    </>
  );
}

function ImportsSkeleton() {
  return (
    <>
      <Skeleton className="mb-6 h-28 rounded-xl" />
      <ListCardSkeleton rows={4} />
    </>
  );
}
