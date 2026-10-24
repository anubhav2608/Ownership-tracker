import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { FormCardSkeleton } from "@/components/skeletons";
import { getCurrentUser, getImport, getItems } from "@/lib/data";
import { AddRecord, type AddTab } from "./add-record";

export const metadata: Metadata = { title: "Add record" };

const tabs: AddTab[] = ["forward", "upload", "manual"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AddPage({ searchParams }: PageProps<"/add">) {
  return (
    <>
      <PageHeader
        title="Add a record"
        description="A purchase, invoice, refund, warranty card or service receipt."
      />
      <Suspense fallback={<FormCardSkeleton />}>
        <AddContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AddContent({ searchParams }: Pick<PageProps<"/add">, "searchParams">) {
  const { tab, import: importParam } = await searchParams;
  const importId = typeof importParam === "string" && UUID.test(importParam) ? importParam : null;
  const [user, items, source] = await Promise.all([
    getCurrentUser(),
    getItems(),
    importId ? getImport(importId) : undefined,
  ]);
  const fromImport =
    source && source.status !== "imported" ? { id: source.id, title: source.title } : undefined;
  const initial = fromImport ? "manual" : tabs.includes(tab as AddTab) ? (tab as AddTab) : "forward";

  return (
    <AddRecord
      key={`${initial}:${fromImport?.id ?? ""}`}
      initialTab={initial}
      fromImport={fromImport}
      userId={user.id}
      forwardingAddress={user.forwardingAddress}
      items={items
        .filter((i) => i.status === "owned")
        .map((i) => ({ id: i.id, name: i.name, isVehicle: i.category === "Vehicle" }))}
    />
  );
}
