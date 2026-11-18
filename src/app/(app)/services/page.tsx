import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout-bits";
import { ListCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { getItems, getServiceEvents } from "@/lib/data";
import { FilterBanner } from "@/components/filter-banner";
import {
  inPeriod,
  isCategory,
  isMerchant,
  parseViewFilter,
} from "@/lib/view-filter";
import { ServiceHistory } from "../items/[id]/service-history";

export const metadata: Metadata = { title: "Services" };

// Every service in one place: those on an item (also in its history) and those
// on none, like a home service booking.
async function ServicesContent({
  searchParams,
}: Pick<PageProps<"/services">, "searchParams">) {
  const filter = parseViewFilter(await searchParams);
  const [allEvents, items] = await Promise.all([
    getServiceEvents(),
    getItems(),
  ]);
  // From a dashboard box: its period, provider and category (a service on no item is Miscellaneous).
  const events = allEvents.filter(
    (e) =>
      inPeriod(filter, e.date) &&
      isMerchant(filter, e.provider || undefined) &&
      isCategory(
        filter,
        items.find((i) => i.id === e.itemId)?.category ?? "Miscellaneous",
      ),
  );
  return (
    <>
      <FilterBanner filter={filter} clearHref="/services" what="services" />
      <ServiceHistory
        key={JSON.stringify(filter)}
        initial={events}
        showOdometer={false}
        title="All services"
        emptyText="Repairs, servicing and home services show up here: forward or upload the receipt, or add one."
        itemNames={Object.fromEntries(items.map((i) => [i.id, i.name]))}
      />
    </>
  );
}

export default function ServicesPage({ searchParams }: PageProps<"/services">) {
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
        <ServicesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
