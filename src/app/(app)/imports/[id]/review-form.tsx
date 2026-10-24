"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FieldStateBadge, LOW_CONFIDENCE } from "@/components/badges";
import { SectionCard } from "@/components/layout-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { guessCategory } from "@/lib/extraction/category";
import { formatMoney } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { CATEGORIES, type Category, type ExtractedLine, type FieldState, type ImportRecord, type Tracked } from "@/lib/types";
import { createPurchase, createServiceEvent, type PurchaseInput } from "../../add/actions";
import { DiscardButton } from "./status-panels";
import { ReplacePurchaseDialog } from "@/components/replace-purchase-dialog";
import type { ExistingPurchase } from "@/lib/purchases";

type ItemOption = { id: string; name: string; brand?: string };


/** A field being reviewed. Editing an extracted value makes it user-confirmed. */
interface Draft {
  value: string;
  state: FieldState;
  confidence?: number;
}

const toDraft = (t?: Tracked<string | number>): Draft =>
  t
    ? { value: t.value === null ? "" : String(t.value), state: t.state, confidence: t.confidence }
    : { value: "", state: "missing" };

const confirmed = (value: string): Draft => ({ value, state: value ? "confirmed" : "missing" });
const number = (d?: Draft) => (d && d.value !== "" ? Number(d.value) : undefined);

/** Only values the user hasn't checked are recorded; the rest count as confirmed. */
function meta(drafts: Record<string, Draft | undefined>) {
  const out: NonNullable<PurchaseInput["fieldMeta"]> = {};
  for (const [column, d] of Object.entries(drafts)) {
    if (d?.state === "extracted") out[column] = { state: "extracted", confidence: d.confidence };
  }
  return out;
}

/** Candidates closer than this are treated as a tie, so we never pre-pick one. */
const AMBIGUITY_GAP = 0.15;
const AUTO_MATCH_SCORE = 0.9;

interface LineDraft {
  name: Draft;
  price: Draft;
  category: Category;
  target: "new" | "skip";
}

export function ReviewForm({ record, items }: { record: ImportRecord; items: ItemOption[] }) {
  const router = useRouter();
  const fid = useId();
  const isService = record.documentKind === "service_receipt";
  const f = record.fields ?? {};

  const [fields, setFields] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, toDraft(v)])),
  );
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (record.lines ?? []).map((l) => ({ ...lineDraft(l), category: guessCategory(String(l.name.value ?? "")), target: "new" })),
  );
  const [parts] = useState(() => (record.parts ?? []).map(lineDraft));
  const [warrantyFor, setWarrantyFor] = useState(() => defaultWarrantyLine(record.lines ?? []));
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingPurchase | null>(null);

  const candidates = [...(record.candidates ?? [])]
    .filter((c) => items.some((i) => i.id === c.itemId))
    .sort((a, b) => b.score - a.score);
  const [top, second] = candidates;
  const clearWinner =
    top && top.score >= AUTO_MATCH_SCORE && (!second || top.score - second.score > AMBIGUITY_GAP);
  const [assetChoice, setAssetChoice] = useState(clearWinner ? top.itemId : "");
  const [otherItem, setOtherItem] = useState("");
  const serviceItem = assetChoice === "other" ? otherItem : assetChoice;

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: confirmed(value) }));
  }
  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  const kept = lines.filter((l) => l.target === "new");
  const lineSum = kept.reduce((s, l) => s + (Number(l.price.value) || 0), 0);
  const total = Number(fields.total?.value) || 0;
  const totalMismatch = !isService && kept.length > 0 && total > 0 && Math.abs(lineSum - total) > 0.005;

  const assetResolved = !isService || serviceItem !== "";
  const lowConfidenceLeft = [...Object.values(fields), ...lines.flatMap((l) => [l.name, l.price])].some(
    (d) => d.state === "extracted" && (d.confidence ?? 1) < LOW_CONFIDENCE,
  );
  const warranty = fields.warrantyMonths;
  const warrantyEvidence = fields.warrantyEvidence?.value;

  function done(message: string, href: string) {
    toast.success(message);
    router.push(href);
  }

  async function savePurchase(replaceOrderId?: string) {
    if (!fields.merchant?.value || !fields.date?.value) {
      toast.error("Add the merchant and order date first.");
      return;
    }
    if (kept.length === 0 || kept.some((l) => !l.name.value.trim())) {
      toast.error("Keep at least one item, and give each kept item a name.");
      return;
    }
    const months = number(warranty);
    const result = await createPurchase({
      merchant: fields.merchant.value,
      orderDate: fields.date.value,
      orderRef: fields.orderRef?.value || undefined,
      invoiceRef: fields.invoiceRef?.value || undefined,
      total: number(fields.total),
      importId: record.id,
      replaceOrderId,
      fieldMeta: meta({
        merchant: fields.merchant,
        order_ref: fields.orderRef,
        invoice_ref: fields.invoiceRef,
        order_date: fields.date,
        total: fields.total,
      }),
      items: lines.flatMap((l, i) =>
        l.target === "skip"
          ? []
          : [
              {
                name: l.name.value,
                category: l.category,
                price: number(l.price),
                returnBy: fields.returnBy?.value || undefined,
                fieldMeta: meta({ name: l.name, price: l.price, return_by: fields.returnBy }),
                warranty:
                  months && (warrantyFor === "all" || warrantyFor === String(i))
                    ? warranty?.state === "extracted" && warrantyEvidence
                      ? { months, state: "extracted" as const, evidence: warrantyEvidence }
                      : { months, state: "confirmed" as const, evidence: warrantyEvidence || "Entered by you" }
                    : undefined,
              },
            ],
      ),
    });
    if (!result.ok) {
      // Same order or invoice number as a saved purchase: ask before overriding it.
      if (result.existing) return setExisting(result.existing);
      return toast.error(result.message);
    }
    done(replaceOrderId ? "Purchase replaced" : "Purchase saved", `/purchases/${result.id}`);
  }

  async function replaceExisting(old: ExistingPurchase) {
    setExisting(null);
    setSaving(true);
    try {
      await savePurchase(old.id);
    } finally {
      setSaving(false);
    }
  }

  async function saveService() {
    const totalCost = number(fields.total);
    if (!fields.date?.value || !fields.workPerformed?.value || totalCost === undefined) {
      toast.error("Add the date, the work performed and the total paid first.");
      return;
    }
    const result = await createServiceEvent({
      itemId: serviceItem,
      serviceDate: fields.date.value,
      workPerformed: fields.workPerformed.value,
      provider: fields.provider?.value || undefined,
      totalCost,
      labourCost: number(fields.labourCost),
      parts: parts.map((p) => ({ name: p.name.value, cost: number(p.price) })),
      importId: record.id,
    });
    if (!result.ok) return toast.error(result.message);
    done("Service event saved", `/items/${serviceItem}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetResolved) return;
    if (!isSupabaseConfigured) {
      return done(isService ? "Service event saved" : "Purchase saved", isService ? "/items" : "/purchases");
    }
    setSaving(true);
    try {
      await (isService ? saveService() : savePurchase());
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <ReplacePurchaseDialog existing={existing} onCancel={() => setExisting(null)} onReplace={replaceExisting} />
      {record.reviewReasons && (
        <Alert>
          <AlertTriangle className="text-warning" />
          <AlertTitle>Please check before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {record.reviewReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <SectionCard
        title={isService ? "Service details" : "Order details"}
        action={<span className="text-xs text-muted-foreground">Editing a value confirms it</span>}
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {isService ? (
            <>
              <FieldInput fid={fid} label="Provider" name="provider" draft={fields.provider} onChange={setField} />
              <FieldInput fid={fid} label="Date" name="date" type="date" draft={fields.date} onChange={setField} />
              <FieldInput fid={fid} label="Work performed" name="workPerformed" draft={fields.workPerformed} onChange={setField} className="sm:col-span-2" />
              <FieldInput fid={fid} label="Total paid" name="total" type="number" draft={fields.total} onChange={setField} />
              <FieldInput fid={fid} label="Labour" name="labourCost" type="number" draft={fields.labourCost} onChange={setField} />
            </>
          ) : (
            <>
              <FieldInput fid={fid} label="Merchant" name="merchant" draft={fields.merchant} onChange={setField} />
              <FieldInput fid={fid} label="Order number" name="orderRef" draft={fields.orderRef} onChange={setField} />
              <FieldInput fid={fid} label="Invoice number" name="invoiceRef" draft={fields.invoiceRef} onChange={setField} />
              <FieldInput fid={fid} label="Order date" name="date" type="date" draft={fields.date} onChange={setField} />
              <FieldInput fid={fid} label="Order total" name="total" type="number" draft={fields.total} onChange={setField} />
              <FieldInput
                fid={fid}
                label="Return by"
                name="returnBy"
                type="date"
                draft={fields.returnBy}
                onChange={setField}
                hint="Not found in this document. Applies to every item; change it per item later."
              />
              <FieldInput
                fid={fid}
                label="Warranty (months)"
                name="warrantyMonths"
                type="number"
                draft={warranty}
                onChange={setField}
                hint="Not found in this document. Leave empty unless your documents state one; we only store warranties backed by a source."
              />
              {warranty?.value && lines.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor={`${fid}-warranty-for`}>Warranty applies to</Label>
                  <NativeSelect
                    id={`${fid}-warranty-for`}
                    wrapperClassName="w-full"
                    value={warrantyFor}
                    onChange={(e) => setWarrantyFor(e.target.value)}
                  >
                    {lines.map((l, i) => (
                      <NativeSelectOption key={i} value={String(i)}>
                        {l.name.value || `Item ${i + 1}`}
                      </NativeSelectOption>
                    ))}
                    {lines.length > 1 && <NativeSelectOption value="all">Every item</NativeSelectOption>}
                  </NativeSelect>
                </div>
              )}
              {warrantyEvidence && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  From the document: {warrantyEvidence}
                </p>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {!isService && (
        <SectionCard title={`Items in this order (${lines.length})`}>
          {lines.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              We couldn&rsquo;t find the items on this document.{" "}
              <Link href={`/add?tab=manual&import=${record.id}`} className="underline underline-offset-4">
                Enter them manually
              </Link>
              ; this file will be attached.
            </p>
          )}
          <ul className="divide-y">
            {lines.map((l, i) => (
              <li key={i} className={cn("grid gap-3 p-5 sm:grid-cols-[1fr_11rem]", l.target === "skip" && "opacity-60")}>
                <DraftInput id={`${fid}-line-${i}-name`} label="Item name" draft={l.name} onChange={(v) => updateLine(i, { name: confirmed(v) })} />
                <DraftInput id={`${fid}-line-${i}-price`} label="Price" type="number" draft={l.price} onChange={(v) => updateLine(i, { price: confirmed(v) })} />
                <div className="grid gap-2">
                  <Label htmlFor={`${fid}-line-${i}-category`}>Category</Label>
                  <NativeSelect
                    id={`${fid}-line-${i}-category`}
                    wrapperClassName="w-full"
                    value={l.category}
                    onChange={(e) => updateLine(i, { category: e.target.value as Category })}
                  >
                    {CATEGORIES.map((c) => (
                      <NativeSelectOption key={c} value={c}>
                        {c}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fid}-line-${i}-target`}>Save as</Label>
                  <NativeSelect
                    id={`${fid}-line-${i}-target`}
                    wrapperClassName="w-full"
                    value={l.target}
                    onChange={(e) => updateLine(i, { target: e.target.value as LineDraft["target"] })}
                  >
                    <NativeSelectOption value="new">A new item</NativeSelectOption>
                    <NativeSelectOption value="skip">Don&rsquo;t track this line</NativeSelectOption>
                  </NativeSelect>
                </div>
              </li>
            ))}
          </ul>
          {totalMismatch && (
            <p className="flex items-center gap-2 border-t bg-warning-soft px-5 py-3 text-sm text-warning">
              <AlertTriangle className="size-4 shrink-0" />
              Items add up to {formatMoney(lineSum)}, but the order total is {formatMoney(total)}.
              Check for shipping, discounts, or a misread price.
            </p>
          )}
        </SectionCard>
      )}

      {isService && parts.length > 0 && (
        <SectionCard title="Parts replaced">
          <ul className="divide-y">
            {parts.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex items-center gap-2">
                  {p.name.value}
                  <FieldStateBadge state={p.name.state} confidence={p.name.confidence} />
                </span>
                <span className="tabular-nums">{p.price.value ? formatMoney(Number(p.price.value)) : "—"}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {isService && (
        <SectionCard title="Which item was serviced?">
          <div className="p-5">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don&rsquo;t have any items yet. Add the purchase of the serviced item first,
                then come back to save this receipt.
              </p>
            ) : (
              <>
                {!clearWinner && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    We couldn&rsquo;t tell for sure, so nothing is selected. Pick the right one;
                    we won&rsquo;t attach it to an item on a guess.
                  </p>
                )}
                <RadioGroup value={assetChoice} onValueChange={setAssetChoice} className="gap-3">
                  {candidates.map((c) => {
                    const item = items.find((i) => i.id === c.itemId);
                    return (
                      <Label
                        key={c.itemId}
                        htmlFor={`${fid}-cand-${c.itemId}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal",
                          assetChoice === c.itemId && "border-primary bg-accent",
                        )}
                      >
                        <RadioGroupItem id={`${fid}-cand-${c.itemId}`} value={c.itemId} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item?.name}</p>
                          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                            {c.evidence.map((ev) => (
                              <li key={ev}>{ev}</li>
                            ))}
                          </ul>
                        </div>
                      </Label>
                    );
                  })}
                  <Label
                    htmlFor={`${fid}-cand-other`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal",
                      assetChoice === "other" && "border-primary bg-accent",
                    )}
                  >
                    <RadioGroupItem id={`${fid}-cand-other`} value="other" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{candidates.length ? "A different item" : "Choose the item"}</p>
                      {assetChoice === "other" && (
                        <NativeSelect
                          wrapperClassName="mt-2 w-full"
                          value={otherItem}
                          onChange={(e) => setOtherItem(e.target.value)}
                          aria-label="Choose item"
                        >
                          <NativeSelectOption value="">Choose an item…</NativeSelectOption>
                          {items.map((it) => (
                            <NativeSelectOption key={it.id} value={it.id}>
                              {it.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                  </Label>
                </RadioGroup>
              </>
            )}
          </div>
        </SectionCard>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {lowConfidenceLeft && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Fields you don&rsquo;t touch are saved as &ldquo;extracted&rdquo;, not confirmed.
          </p>
        )}
        <DiscardButton importId={record.id} label="Discard" />
        <Button type="submit" disabled={!assetResolved || saving}>
          {saving ? "Saving…" : assetResolved ? "Confirm and save" : "Choose an item to save"}
        </Button>
      </div>
    </form>
  );
}

function lineDraft(l: ExtractedLine) {
  return { name: toDraft(l.name), price: toDraft(l.price) };
}

/** The warranty usually belongs to the main product: the most expensive line. */
function defaultWarrantyLine(lines: ExtractedLine[]) {
  let best = 0;
  lines.forEach((l, i) => {
    if ((l.price.value ?? 0) > (lines[best].price.value ?? 0)) best = i;
  });
  return String(best);
}

function FieldInput({
  fid,
  label,
  name,
  draft = { value: "", state: "missing" },
  onChange,
  type = "text",
  hint,
  className,
}: {
  fid: string;
  label: string;
  name: string;
  draft?: Draft;
  onChange: (name: string, value: string) => void;
  type?: "text" | "date" | "number";
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <DraftInput label={label} id={`${fid}-${name}`} type={type} draft={draft} onChange={(v) => onChange(name, v)} />
      {hint && draft.state === "missing" && (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function DraftInput({
  label,
  id,
  draft,
  onChange,
  type = "text",
}: {
  label: string;
  id: string;
  draft: Draft;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number";
}) {
  const low = draft.state === "extracted" && (draft.confidence ?? 1) < LOW_CONFIDENCE;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <FieldStateBadge state={draft.state} confidence={draft.confidence} />
      </div>
      <Input
        id={id}
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={draft.value}
        placeholder={draft.state === "missing" ? "Not found" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(low && "border-warning bg-warning-soft/40")}
      />
    </div>
  );
}
