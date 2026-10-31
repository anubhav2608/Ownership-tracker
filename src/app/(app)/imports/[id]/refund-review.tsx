"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatDate, formatMoney } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ImportRecord } from "@/lib/types";
import { corrections } from "@/lib/evals/feedback";
import { applyRefund, recordFeedback } from "../actions";
import { DiscardButton } from "./status-panels";

export interface RefundPurchase {
  id: string;
  merchant: string;
  orderRef?: string;
  orderDate: string;
  total: number;
  refundedAmount?: number;
  /** Still owned: the ones that can go back. */
  items: { id: string; name: string; price: number | null }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

const TICKED_BECAUSE = {
  name: "Ticked because the email names them.",
  only_item: "Ticked because it's the only item in this purchase.",
  price: "Ticked because the refund matches the price.",
  whole_order: "Ticked because the whole order was cancelled.",
} as const;

/**
 * A forwarded refund notice: the purchase it's for (matched by order number, or
 * chosen), the items that went back and the money back. Nothing changes until
 * the user applies it.
 */
export function RefundReview({ record, purchases }: { record: ImportRecord; purchases: RefundPurchase[] }) {
  const fid = useId();
  const router = useRouter();
  const match = record.refundMatch;
  const [orderId, setOrderId] = useState(match?.orderId ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set(match?.itemIds ?? []));
  // As the notice says: a cancellation or a return.
  const [outcome, setOutcome] = useState<"returned" | "cancelled">(record.fields?.outcome?.value ?? "returned");
  const [refund, setRefund] = useState(String(record.fields?.total?.value ?? ""));
  const [saving, setSaving] = useState(false);

  const purchase = purchases.find((p) => p.id === orderId);
  const left = purchase ? round(Math.max(0, purchase.total - (purchase.refundedAmount ?? 0))) : 0;
  const amount = Number(refund);
  const amountOk = refund.trim() !== "" && Number.isFinite(amount) && amount >= 0 && (!purchase || amount <= left);
  const named = (record.lines ?? []).flatMap((l) => (l.name.value ? [l.name.value] : []));
  const ref = record.fields?.orderRef?.value;

  function choosePurchase(id: string) {
    setOrderId(id);
    // Items belong to one purchase: start again for another.
    setChosen(new Set(id === match?.orderId ? match.itemIds : []));
  }

  function toggle(id: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!purchase || !amountOk) return;
    if (isSupabaseConfigured) {
      setSaving(true);
      const result = await applyRefund(record.id, {
        orderId,
        itemIds: [...chosen],
        outcome,
        refund: amount,
        happenedOn: record.fields?.date?.value ?? undefined,
      });
      setSaving(false);
      if (!result.ok) return void toast.error(result.message);
      // What was changed from what was matched (Settings → How well emails are read).
      const sorted = (ids: Iterable<string>) => [...ids].sort().join(",");
      await recordFeedback(record.id, {
        shop: record.fields?.merchant?.value ?? null,
        parser: record.parser ?? null,
        documentKind: record.documentKind ?? null,
        rows: [
          ...corrections(
            { total: record.fields?.total, outcome: record.fields?.outcome },
            { total: amount, outcome },
          ),
          { field: "refund.purchase", extracted: match?.orderId ?? null, saved: orderId, changed: (match?.orderId ?? null) !== orderId },
          {
            field: "refund.items",
            extracted: sorted(match?.itemIds ?? []) || null,
            saved: sorted(chosen) || null,
            changed: sorted(match?.itemIds ?? []) !== sorted(chosen),
          },
        ],
      }).catch(() => {});
    }
    toast.success(`Refund of ${formatMoney(amount)} applied to the ${purchase.merchant} purchase`);
    router.push(`/purchases/${orderId}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {record.reviewReasons && record.reviewReasons.length > 0 && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Check before applying</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {record.reviewReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <SectionCard title="Refund">
        <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">From</dt>
            <dd className="font-medium">{record.fields?.merchant?.value ?? "—"}</dd>
          </div>
          {record.fields?.date?.value && (
            <div>
              <dt className="text-xs text-muted-foreground">Date</dt>
              <dd>{formatDate(record.fields.date.value)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Order number</dt>
            <dd className="font-mono">{ref ?? "—"}</dd>
          </div>
          {named.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Refunded item{named.length === 1 ? "" : "s"}</dt>
              {named.map((n) => (
                <dd key={n}>{n}</dd>
              ))}
            </div>
          )}
        </dl>
      </SectionCard>

      <SectionCard title="Apply it to">
        <div className="grid gap-5 px-5 py-4">
          <div className="grid gap-2">
            <Label htmlFor={`${fid}-purchase`}>Purchase</Label>
            <NativeSelect id={`${fid}-purchase`} value={orderId} onChange={(e) => choosePurchase(e.target.value)}>
              <NativeSelectOption value="">Choose a purchase…</NativeSelectOption>
              {purchases.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.merchant} · {formatDate(p.orderDate)} · {formatMoney(p.total)}
                  {p.orderRef ? ` · ${p.orderRef}` : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {purchase && match?.orderId === purchase.id && (
              <p className="text-xs text-muted-foreground">
                {match.matchedOn === "order_number"
                  ? "Matched by its order number."
                  : `Matched by order number ${ref}, which was in the email this purchase was saved from.`}{" "}
                <Link href={`/purchases/${purchase.id}`} className="text-primary hover:underline">
                  View purchase
                </Link>
              </p>
            )}
          </div>

          {purchase && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Which items went back?</legend>
              {match?.orderId === purchase.id && match.itemsBy && chosen.size > 0 && (
                <p className="-mt-1 mb-1 text-xs text-muted-foreground">{TICKED_BECAUSE[match.itemsBy]}</p>
              )}
              {purchase.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in this purchase is still owned.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {purchase.items.map((i) => (
                    <li key={i.id}>
                      <Label htmlFor={`${fid}-item-${i.id}`} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 font-normal">
                        <Checkbox
                          id={`${fid}-item-${i.id}`}
                          checked={chosen.has(i.id)}
                          onCheckedChange={(on) => toggle(i.id, on === true)}
                        />
                        <span className="min-w-0 flex-1 truncate">{i.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {i.price !== null ? formatMoney(i.price) : "—"}
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Leave all unticked for money back without anything going back, like a price drop.
              </p>
            </fieldset>
          )}

          {purchase && chosen.size > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">What happened?</legend>
              <RadioGroup
                value={outcome}
                onValueChange={(v) => setOutcome(v as "returned" | "cancelled")}
                className="grid grid-cols-2 gap-2 sm:max-w-sm"
              >
                {(["returned", "cancelled"] as const).map((o) => (
                  <Label
                    key={o}
                    htmlFor={`${fid}-${o}`}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
                  >
                    <RadioGroupItem id={`${fid}-${o}`} value={o} />
                    {o === "returned" ? "Returned" : "Cancelled"}
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor={`${fid}-refund`}>Money back</Label>
            <Input
              id={`${fid}-refund`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              aria-invalid={!amountOk}
            />
            {!amountOk && purchase && (
              <p className="text-xs text-destructive">Between ₹0 and {formatMoney(left)}, what&rsquo;s left of this purchase.</p>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !purchase || !amountOk}>
          <RotateCcw /> {saving ? "Applying…" : "Apply refund"}
        </Button>
        <DiscardButton importId={record.id} label="Discard" />
      </div>
    </form>
  );
}
