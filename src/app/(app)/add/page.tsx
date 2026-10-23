import type { Metadata } from "next";
import { PageHeader } from "@/components/layout-bits";
import { getCurrentUser, getItems } from "@/lib/mock-data";
import { AddRecord, type AddTab } from "./add-record";

export const metadata: Metadata = { title: "Add record" };

const tabs: AddTab[] = ["forward", "upload", "manual"];

export default async function AddPage(props: PageProps<"/add">) {
  const { tab } = await props.searchParams;
  const [user, items] = await Promise.all([getCurrentUser(), getItems()]);
  const initial = tabs.includes(tab as AddTab) ? (tab as AddTab) : "forward";

  return (
    <>
      <PageHeader
        title="Add a record"
        description="A purchase, invoice, refund, warranty card or service receipt."
      />
      <AddRecord
        initialTab={initial}
        forwardingAddress={user.forwardingAddress}
        items={items
          .filter((i) => i.status === "owned")
          .map((i) => ({ id: i.id, name: i.name, isVehicle: i.category === "Vehicle" }))}
      />
    </>
  );
}
