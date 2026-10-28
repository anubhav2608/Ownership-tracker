import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { getItems, getServiceEvents } from "@/lib/data";
import { ServiceHistory } from "../items/[id]/service-history";

export const metadata: Metadata = { title: "Services" };

// Every service in one place: those on an item (also in its history) and those
// on none, like a home service booking.
async function ServicesContent() {
  const [events, items] = await Promise.all([getServiceEvents(), getItems()]);
  return (
    <ServiceHistory
      initial={events}
      showOdometer={false}
      title="All services"
      emptyText="Repairs, servicing and home services show up here: forward or upload the receipt, or add one."
      itemNames={Object.fromEntries(items.map((i) => [i.id, i.name]))}
    />
  );
}

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Services"
        description="Repairs, servicing and home services, on your items or on their own."
        action={
          <Button asChild>
            <Link href="/add?tab=manual">Add record</Link>
          </Button>
        }
      />
      <Suspense fallback={<ListCardSkeleton rows={4} />}>
        <ServicesContent />
      </Suspense>
    </>
  );
}
