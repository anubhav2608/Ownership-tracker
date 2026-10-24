import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { FormCardSkeleton } from "@/components/skeletons";
import { getCurrentUser, getItems } from "@/lib/data";
import { AddRecord, type AddTab } from "./add-record";

export const metadata: Metadata = { title: "Add record" };

const tabs: AddTab[] = ["forward", "upload", "manual"];

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
  const { tab } = await searchParams;
  const [user, items] = await Promise.all([getCurrentUser(), getItems()]);
  const initial = tabs.includes(tab as AddTab) ? (tab as AddTab) : "forward";

  return (
    <AddRecord
      initialTab={initial}
      userId={user.id}
      forwardingAddress={user.forwardingAddress}
      items={items
        .filter((i) => i.status === "owned")
        .map((i) => ({ id: i.id, name: i.name, isVehicle: i.category === "Vehicle" }))}
    />
  );
}
