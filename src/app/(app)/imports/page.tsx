import type { Metadata } from "next";
import Link from "next/link";
import { ForwardingAddress } from "@/components/copy-button";
import { PageHeader } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getImports } from "@/lib/mock-data";
import { ImportsList } from "./imports-list";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage() {
  const [user, imports] = await Promise.all([getCurrentUser(), getImports()]);
  const sorted = [...imports].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

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
      <div className="mb-6 rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm text-muted-foreground">Forward receipts to</p>
        <ForwardingAddress address={user.forwardingAddress} />
      </div>
      <ImportsList imports={sorted} />
    </>
  );
}
