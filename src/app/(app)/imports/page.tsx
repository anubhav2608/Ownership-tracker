import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, getImports } from "@/lib/data";
import { ImportsList } from "./imports-list";

export const metadata: Metadata = { title: "Add an Invoice" };

async function ImportsContent() {
  const [user, imports] = await Promise.all([getCurrentUser(), getImports()]);
  const sorted = [...imports].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <>
      <div className="mb-6 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Upload a service invoice</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.demo ? "A PDF or an email saved as .eml." : "A PDF, a photo, or an email saved as .eml."} If we read it
            accurately and it matches your car, it&rsquo;s saved on its own; otherwise it waits here for you.
            {user.demo && " Photos (JPEG, PNG) are available with the paid version of the app only."}
          </p>
          <Button asChild className="mt-3">
            <Link href="/add?tab=upload">
              <Upload /> Upload an invoice
            </Link>
          </Button>
        </div>
      </div>
      <ImportsList imports={sorted} />
    </>
  );
}

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Add an Invoice"
        description="Every uploaded invoice, what we did with it, and anything that needs you."
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
