"use client";

import { useRouter } from "next/navigation";
import { FileUp, Mail, PencilLine, X, type LucideIcon } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/format";

export type AddTab = "forward" | "upload" | "manual";

const tabMeta: Record<AddTab, { label: string; icon: LucideIcon }> = {
  forward: { label: "Forward email", icon: Mail },
  upload: { label: "Upload document", icon: FileUp },
  manual: { label: "Enter manually", icon: PencilLine },
};

export function AddRecord({
  initialTab,
  forwardingAddress,
}: {
  initialTab: AddTab;
  forwardingAddress: string;
}) {
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 grid grid-cols-3 gap-2">
        {(Object.keys(tabMeta) as AddTab[]).map((t) => {
          const { label, icon: Icon } = tabMeta[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition sm:flex-row sm:justify-center",
                tab === t
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-surface text-muted hover:text-fg",
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "forward" && <ForwardTab address={forwardingAddress} />}
      {tab === "upload" && <UploadTab />}
      {tab === "manual" && <ManualTab />}
    </div>
  );
}

function ForwardTab({ address }: { address: string }) {
  return (
    <Card className="p-6">
      <h2 className="font-medium">Forward it to your private address</h2>
      <p className="mt-1 text-sm text-muted">
        Order confirmations, e-invoices, warranty registrations and service bills all work.
        Attachments (PDF or images) are read too.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-sm">
          {address}
        </code>
        <CopyButton value={address} label="Copy address" />
      </div>
      <ul className="mt-6 space-y-2 text-sm text-muted">
        <li>• Send from an address listed under Settings → Verified senders.</li>
        <li>• Forwarding the same email twice is fine; duplicates are skipped.</li>
        <li>• You&rsquo;ll get a notification when it&rsquo;s processed or needs a check.</li>
      </ul>
    </Card>
  );
}

function UploadTab() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (list) setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <Card className="p-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
          dragging ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
        )}
      >
        <FileUp className="size-8 text-muted" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium">Drop invoices or receipts here</p>
        <p className="mt-1 text-xs text-muted">PDF, JPG, PNG or HEIC, up to 10 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="text-muted hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => router.push("/inbox")}>
              Process {files.length} file{files.length > 1 && "s"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ManualTab() {
  const router = useRouter();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push("/items");
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name" className="sm:col-span-2">
            <input required placeholder="e.g. Refrigerator" className={inputClass} />
          </Field>
          <Field label="Brand">
            <input placeholder="e.g. Samsung" className={inputClass} />
          </Field>
          <Field label="Model">
            <input className={inputClass} />
          </Field>
          <Field label="Category">
            <select className={inputClass} defaultValue="Electronics">
              <option>Electronics</option>
              <option>Appliances</option>
              <option>Vehicle</option>
              <option>Furniture</option>
              <option>Home</option>
            </select>
          </Field>
          <Field label="Serial number">
            <input className={inputClass} />
          </Field>
          <Field label="Bought from">
            <input required placeholder="Store or website" className={inputClass} />
          </Field>
          <Field label="Purchase date">
            <input required type="date" className={inputClass} />
          </Field>
          <Field label="Price">
            <input required type="number" min="0" className={inputClass} />
          </Field>
          <Field label="Warranty (months)" hint="Leave empty if none">
            <input type="number" min="0" placeholder="12" className={inputClass} />
          </Field>
          <Field label="Return window ends" hint="Optional, for a reminder">
            <input type="date" className={inputClass} />
          </Field>
          <Field label="Invoice" hint="Optional">
            <input type="file" accept=".pdf,image/*" className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg" />
          </Field>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="submit">Save item</Button>
        </div>
      </form>
    </Card>
  );
}
