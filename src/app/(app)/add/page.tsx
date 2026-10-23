import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/mock-data";
import { AddRecord, type AddTab } from "./add-record";

export const metadata: Metadata = { title: "Add record" };

const tabs: AddTab[] = ["forward", "upload", "manual"];

export default async function AddPage(props: PageProps<"/add">) {
  const { tab } = await props.searchParams;
  const currentUser = await getCurrentUser();
  const initial = tabs.includes(tab as AddTab) ? (tab as AddTab) : "forward";

  return (
    <>
      <PageHeader
        title="Add a record"
        description="A purchase, invoice, warranty card or service bill."
      />
      <AddRecord initialTab={initial} forwardingAddress={currentUser.forwardingAddress} />
    </>
  );
}
