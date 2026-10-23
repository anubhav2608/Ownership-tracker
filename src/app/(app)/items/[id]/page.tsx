import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText, RotateCcw, ShieldCheck } from "lucide-react";
import {
  CategoryIcon,
  SourceLabel,
  StatusBadge,
  WarrantyBadge,
} from "@/components/item-bits";
import { Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import {
  daysUntil,
  formatDate,
  formatMoney,
  fractionElapsed,
  relativeDays,
} from "@/lib/format";
import { getItem } from "@/lib/mock-data";
import { ServiceHistory } from "./service-history";

export async function generateMetadata(props: PageProps<"/items/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: (await getItem(id))?.name ?? "Item" };
}

export default async function ItemPage(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const item = await getItem(id);
  if (!item) notFound();

  const { purchase, warranty } = item;
  const returnOpen = item.returnWindowEndsOn && daysUntil(item.returnWindowEndsOn) >= 0;

  const elapsed = warranty ? fractionElapsed(purchase.date, warranty.expiresOn) : 0;

  return (
    <>
      <Link
        href="/items"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Items
      </Link>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <CategoryIcon category={item.category} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {item.brand}
            {item.model && ` · ${item.model}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={item.status} />
            <WarrantyBadge item={item} />
          </div>
        </div>
        <select
          defaultValue={item.status}
          aria-label="Item status"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm sm:w-auto"
        >
          <option value="active">Mark as: Active</option>
          <option value="returned">Mark as: Returned</option>
          <option value="sold">Mark as: Sold</option>
          <option value="disposed">Mark as: Disposed</option>
        </select>
      </div>

      {returnOpen && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <RotateCcw className="size-4 shrink-0" />
          Return window closes {relativeDays(item.returnWindowEndsOn!)} (
          {formatDate(item.returnWindowEndsOn!)}).
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Purchase" />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <Row label="Merchant" value={purchase.merchant} />
              <Row label="Date" value={formatDate(purchase.date)} />
              <Row label="Price" value={formatMoney(purchase.price)} />
              {purchase.orderId && <Row label="Order ID" value={purchase.orderId} mono />}
              {item.serialNumber && <Row label="Serial no." value={item.serialNumber} mono />}
              <div className="pt-1">
                <SourceLabel source={purchase.source} />
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Invoice" />
            <div className="px-5 py-4">
              {purchase.invoiceFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <FileText className="size-8 shrink-0 text-muted" strokeWidth={1.5} />
                  <p className="min-w-0 flex-1 truncate text-sm">{purchase.invoiceFile}</p>
                  <button className={buttonClass("ghost", "px-2")} aria-label="Download invoice">
                    <Download className="size-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No invoice attached.{" "}
                  <Link href="/add?tab=upload" className="font-medium text-accent">
                    Upload one
                  </Link>
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Warranty" />
            <div className="px-5 py-4 text-sm">
              {warranty ? (
                <>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-accent" />
                    <span className="font-medium">
                      {warranty.months} months, {warranty.provider}
                    </span>
                    {warranty.extended && <Badge tone="info">Extended</Badge>}
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${elapsed >= 1 ? "bg-muted" : elapsed > 0.9 ? "bg-warn" : "bg-accent"}`}
                      style={{ width: `${elapsed * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>{formatDate(purchase.date)}</span>
                    <span>Ends {formatDate(warranty.expiresOn)}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted">No warranty recorded.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <ServiceHistory initial={item.services} />
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono text-xs leading-5" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
