import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { getItems } from "@/lib/mock-data";
import { ItemsList } from "./items-list";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage() {
  const items = await getItems();
  return (
    <>
      <PageHeader
        title="Items"
        description="Everything you own, and everything you used to."
        action={<LinkButton href="/add">Add record</LinkButton>}
      />
      <ItemsList items={items} />
    </>
  );
}
