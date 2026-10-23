"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { ConfidenceDot } from "@/components/inbox-bits";
import { Button, Card, CardHeader, inputClass } from "@/components/ui";
import { cn } from "@/lib/format";
import type { ExtractedField, InboxRecord } from "@/lib/types";

const LOW_CONFIDENCE = 0.75;

export function ReviewForm({
  record,
  items,
}: {
  record: InboxRecord;
  items: { id: string; name: string }[];
}) {
  const router = useRouter();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push("/items");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader
          title="Details"
          action={
            <span className="flex items-center gap-3 text-xs text-muted">
              <Legend className="bg-accent" label="Sure" />
              <Legend className="bg-warn" label="Check" />
              <Legend className="bg-danger" label="Unsure" />
            </span>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <ExtractedInput label="Merchant" field={record.merchant} />
          <ExtractedInput label="Order ID" field={record.orderId} />
          <ExtractedInput label="Date" field={record.date} type="date" />
          <ExtractedInput label="Total" field={record.total} type="number" />
        </div>
      </Card>

      <Card>
        <CardHeader title={`Items on this ${record.source === "email" ? "order" : "bill"}`} />
        <ul className="divide-y divide-line">
          {record.lines.map((line, i) => (
            <li key={i} className="grid gap-3 p-5 sm:grid-cols-[1fr_8rem]">
              <ExtractedInput label="Name" field={line.name} />
              <ExtractedInput label="Price" field={line.price} type="number" />
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted">Save as</span>
                <select
                  defaultValue={line.matchItemId ?? "new"}
                  className={inputClass}
                >
                  <option value="new">New item</option>
                  <optgroup label="Service event for an existing item">
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </optgroup>
                  <option value="skip">Don&rsquo;t track this line</option>
                </select>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/inbox")}>
          Discard
        </Button>
        <Button type="submit">Confirm and save</Button>
      </div>
    </form>
  );
}

function ExtractedInput({
  label,
  field,
  type = "text",
}: {
  label: string;
  field?: ExtractedField<string | number>;
  type?: "text" | "date" | "number";
}) {
  const low = field !== undefined && field.confidence < LOW_CONFIDENCE;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        {field ? <ConfidenceDot confidence={field.confidence} /> : null}
        {label}
      </span>
      <input
        type={type}
        defaultValue={field?.value}
        placeholder={field ? undefined : "Not found"}
        className={cn(inputClass, low && "border-danger/50 bg-danger-soft/40")}
      />
    </label>
  );
}

function Legend({ className, label }: { className: string; label: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`size-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
