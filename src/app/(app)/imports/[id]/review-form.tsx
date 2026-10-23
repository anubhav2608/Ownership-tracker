"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FieldStateBadge, LOW_CONFIDENCE } from "@/components/badges";
import { SectionCard } from "@/components/layout-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExtractedLine, FieldState, ImportRecord, Tracked } from "@/lib/types";

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

/** Candidates closer than this are treated as a tie, so we never pre-pick one. */
const AMBIGUITY_GAP = 0.15;
const AUTO_MATCH_SCORE = 0.9;

export function ReviewForm({ record, items }: { record: ImportRecord; items: ItemOption[] }) {
  const router = useRouter();
  const isService = record.documentKind === "service_receipt";
  const f = record.fields ?? {};

  const [fields, setFields] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(Object.entries(f).map(([k, v]) => [k, toDraft(v)])),
  );
  const [lines, setLines] = useState(() =>
    (record.lines ?? []).map((l) => ({ ...lineDraft(l), target: "new" })),
  );
  const [parts] = useState(() => (record.parts ?? []).map(lineDraft));

  const candidates = [...(record.candidates ?? [])].sort((a, b) => b.score - a.score);
  const [top, second] = candidates;
  const clearWinner =
    top && top.score >= AUTO_MATCH_SCORE && (!second || top.score - second.score > AMBIGUITY_GAP);
  const [assetChoice, setAssetChoice] = useState(clearWinner ? top.itemId : "");
  const [otherItem, setOtherItem] = useState("");

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: { value, state: value ? "confirmed" : "missing" } }));
  }

  const lineSum = lines
    .filter((l) => l.target !== "skip")
    .reduce((s, l) => s + (Number(l.price.value) || 0), 0);
  const total = Number(fields.total?.value) || 0;
  const totalMismatch = !isService && lines.length > 0 && total > 0 && lineSum !== total;

  const assetResolved =
    !isService || (assetChoice !== "" && (assetChoice !== "other" || otherItem !== ""));
  const lowConfidenceLeft = Object.values(fields).some(
    (d) => d.state === "extracted" && (d.confidence ?? 1) < LOW_CONFIDENCE,
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetResolved) return;
    toast.success(isService ? "Service event saved" : "Purchase saved");
    router.push(isService ? "/items" : "/purchases");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
              <FieldInput label="Provider" name="provider" draft={fields.provider} onChange={setField} />
              <FieldInput label="Date" name="date" type="date" draft={fields.date} onChange={setField} />
              <FieldInput label="Work performed" name="workPerformed" draft={fields.workPerformed} onChange={setField} className="sm:col-span-2" />
              <FieldInput label="Total paid" name="total" type="number" draft={fields.total} onChange={setField} />
            </>
          ) : (
            <>
              <FieldInput label="Merchant" name="merchant" draft={fields.merchant} onChange={setField} />
              <FieldInput label="Order reference" name="orderRef" draft={fields.orderRef} onChange={setField} />
              <FieldInput label="Order date" name="date" type="date" draft={fields.date} onChange={setField} />
              <FieldInput label="Order total" name="total" type="number" draft={fields.total} onChange={setField} />
              <FieldInput
                label="Warranty (months)"
                name="warrantyMonths"
                type="number"
                draft={fields.warrantyMonths}
                onChange={setField}
                hint="Not found in this email. Leave empty unless your documents state one; we only store warranties backed by a source."
              />
            </>
          )}
        </div>
      </SectionCard>

      {!isService && (
        <SectionCard title={`Items in this order (${lines.length})`}>
          <ul className="divide-y">
            {lines.map((l, i) => (
              <li key={i} className="grid gap-3 p-5 sm:grid-cols-[1fr_11rem]">
                <DraftInput label="Item name" draft={l.name} onChange={(v) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, name: { value: v, state: "confirmed" } } : x)))} />
                <DraftInput label="Price" type="number" draft={l.price} onChange={(v) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, price: { value: v, state: "confirmed" } } : x)))} />
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor={`target-${i}`}>Save as</Label>
                  <NativeSelect
                    id={`target-${i}`}
                    wrapperClassName="w-full"
                    value={l.target}
                    onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                  >
                    <NativeSelectOption value="new">A new item</NativeSelectOption>
                    <NativeSelectOption value="skip">Don&rsquo;t track this line</NativeSelectOption>
                    <optgroup label="Same as an item I already have (re-purchase or duplicate)">
                      {items.map((it) => (
                        <NativeSelectOption key={it.id} value={it.id}>
                          {it.name}
                        </NativeSelectOption>
                      ))}
                    </optgroup>
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
                <span className="tabular-nums">{formatMoney(Number(p.price.value))}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {isService && (
        <SectionCard title="Which item was serviced?">
          <div className="p-5">
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
                    htmlFor={`cand-${c.itemId}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal",
                      assetChoice === c.itemId && "border-primary bg-accent",
                    )}
                  >
                    <RadioGroupItem id={`cand-${c.itemId}`} value={c.itemId} className="mt-0.5" />
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
                htmlFor="cand-other"
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal",
                  assetChoice === "other" && "border-primary bg-accent",
                )}
              >
                <RadioGroupItem id="cand-other" value="other" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">A different item</p>
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
              <Label
                htmlFor="cand-new"
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-4 font-normal",
                  assetChoice === "new" && "border-primary bg-accent",
                )}
              >
                <RadioGroupItem id="cand-new" value="new" />
                <span className="flex items-center gap-1.5 font-medium">
                  <Plus className="size-4" /> It&rsquo;s not in my items yet. Create it.
                </span>
              </Label>
            </RadioGroup>
          </div>
        </SectionCard>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {lowConfidenceLeft && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Fields you don&rsquo;t touch are saved as &ldquo;extracted&rdquo;, not confirmed.
          </p>
        )}
        <Button type="button" variant="ghost" onClick={() => router.push("/imports")}>
          Discard
        </Button>
        <Button type="submit" disabled={!assetResolved}>
          {assetResolved ? "Confirm and save" : "Choose an item to save"}
        </Button>
      </div>
    </form>
  );
}

function lineDraft(l: ExtractedLine) {
  return { name: toDraft(l.name), price: toDraft(l.price) };
}

function FieldInput({
  label,
  name,
  draft = { value: "", state: "missing" },
  onChange,
  type = "text",
  hint,
  className,
}: {
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
      <DraftInput
        label={label}
        id={name}
        type={type}
        draft={draft}
        onChange={(v) => onChange(name, v)}
      />
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
  id?: string;
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
        value={draft.value}
        placeholder={draft.state === "missing" ? "Not found" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(low && "border-warning bg-warning-soft/40")}
      />
    </div>
  );
}
