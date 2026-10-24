"use client";

import { useRouter } from "next/navigation";
import { FileUp, Mail, Paperclip, PencilLine, Plus, X } from "lucide-react";
import { type DragEvent, type FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ForwardingAddress } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CATEGORIES, type Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { processImport } from "../imports/actions";
import { ReplacePurchaseDialog } from "@/components/replace-purchase-dialog";
import type { ExistingPurchase } from "@/lib/purchases";
import { createPurchase, createServiceEvent, type PurchaseInput } from "./actions";
import { uploadFile } from "./upload-file";

export type AddTab = "forward" | "upload" | "manual";

const MAX_MB = 10;

export function AddRecord({
  initialTab,
  userId,
  forwardingAddress,
  items,
  fromImport,
}: {
  initialTab: AddTab;
  userId: string;
  forwardingAddress: string;
  items: { id: string; name: string; isVehicle: boolean }[];
  fromImport?: FromImport;
}) {
  return (
    <Tabs defaultValue={initialTab} className="max-w-3xl gap-6">
      <TabsList className="grid h-auto w-full grid-cols-3">
        <TabsTrigger value="forward" className="flex-col gap-1 py-2 sm:flex-row sm:gap-2">
          <Mail /> Forward email
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex-col gap-1 py-2 sm:flex-row sm:gap-2">
          <FileUp /> Upload
        </TabsTrigger>
        <TabsTrigger value="manual" className="flex-col gap-1 py-2 sm:flex-row sm:gap-2">
          <PencilLine /> Enter manually
        </TabsTrigger>
      </TabsList>
      <TabsContent value="forward">
        <ForwardTab address={forwardingAddress} />
      </TabsContent>
      <TabsContent value="upload">
        <UploadTab userId={userId} />
      </TabsContent>
      <TabsContent value="manual">
        <ManualTab items={items} userId={userId} fromImport={fromImport} />
      </TabsContent>
    </Tabs>
  );
}

function ForwardTab({ address }: { address: string }) {
  return (
    <Card className="gap-0 p-6">
      <h2 className="font-medium">Forward only what you choose</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We never connect to your mailbox. Forward an order confirmation, invoice, refund
        notice or service receipt to your private address. PDF and image attachments are
        read too.
      </p>
      <div className="mt-5">
        <ForwardingAddress address={address} />
      </div>
      <ul className="mt-6 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Send from a verified address (Settings → Verified senders). Others are held, unread.</li>
        <li>Forwarding the same email twice is safe; we detect duplicates.</li>
        <li>Track progress under Imports. Anything uncertain waits for your review.</li>
      </ul>
    </Card>
  );
}

function UploadTab({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"uploading" | "reading" | null>(null);

  async function importFiles() {
    if (!isSupabaseConfigured) {
      toast.success(`${files.length} file${files.length > 1 ? "s" : ""} queued for import`);
      router.push("/imports");
      return;
    }

    setBusy("uploading");
    const results = await Promise.all(
      files.map((f) =>
        uploadFile(userId, f).catch(() => ({
          ok: false as const,
          reason: "failed" as const,
          message: `${f.name}: upload failed`,
        })),
      ),
    );

    const imported = results.flatMap((r) => (r.ok ? [r.importId] : []));
    // A file uploaded before opens its earlier import instead, read again if it never was.
    const earlier = results.flatMap((r) => (!r.ok && r.reason === "duplicate" && r.importId ? [r.importId] : []));
    const attached = results.filter((r) => !r.ok && r.reason === "duplicate" && !r.importId).length;
    for (const r of results) if (!r.ok && r.reason !== "duplicate") toast.error(r.message);
    if (attached) {
      toast(`${attached} file${attached > 1 ? "s are" : " is"} already attached to a purchase or service, skipped`);
    }
    const all = [...imported, ...earlier];
    if (all.length === 0) {
      setBusy(null);
      return;
    }

    // Read each file now; whatever it finds waits for review, nothing is saved yet.
    // Earlier imports that were already read or saved are left as they are.
    setBusy("reading");
    const read = await Promise.all(all.map((id) => processImport(id).catch(() => null)));
    setBusy(null);
    setFiles([]);

    // A setup problem (e.g. the database migration is missing) affects every file: say so once.
    const setupError = read.flatMap((r) => (r && !r.ok ? [r.message] : []))[0];
    if (setupError?.includes("db push")) toast.error(setupError, { duration: 15000 });

    const readNow = read.filter((r) => r?.ok);
    const toReview = readNow.filter((r) => r?.ok && r.status === "needs_review").length;
    const notRead = readNow.length - toReview;
    if (earlier.length) {
      toast(`You uploaded ${earlier.length > 1 ? "these files" : "this file"} before, so we opened the earlier import.`);
    }
    if (readNow.length) {
      toast.success(
        notRead === 0
          ? `${toReview} file${toReview > 1 ? "s" : ""} read. Check the details and save.`
          : `${notRead} file${notRead > 1 ? "s" : ""} couldn't be read automatically.${toReview ? ` ${toReview} read and ready to check.` : ""}`,
      );
    }
    router.push(all.length === 1 ? `/imports/${all[0]}` : "/imports");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const ok = Array.from(list).filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (ok.length < list.length) toast.error(`Files over ${MAX_MB} MB were skipped`);
    setFiles((prev) => [...prev, ...ok]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <Card className="gap-0 p-6">
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
          dragging ? "border-primary bg-accent" : "hover:bg-accent",
        )}
      >
        <FileUp className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <span className="mt-3 text-sm font-medium">Drop invoices or receipts, or click to choose</span>
        <span className="mt-1 text-xs text-muted-foreground">
          PDF, JPG, PNG or HEIC, up to {MAX_MB} MB each. Stored privately.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {files.length > 0 && (
        <>
          <ul className="mt-4 divide-y rounded-lg border">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button onClick={importFiles} disabled={busy !== null}>
              {busy === "uploading"
                ? "Uploading…"
                : busy === "reading"
                  ? "Reading…"
                  : `Import ${files.length} file${files.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

type ManualKind = "purchase" | "service";

interface LineRow {
  key: number;
  name: string;
  category: Category;
  price: string;
}

let nextKey = 0;
const newLine = (): LineRow => ({ key: nextKey++, name: "", category: "Electronics", price: "" });

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optionalText = (form: FormData, name: string) => text(form, name) || undefined;
const optionalNumber = (value: string) => (value === "" ? undefined : Number(value));

export interface FromImport {
  id: string;
  title: string;
}

function ManualTab({
  items,
  userId,
  fromImport,
}: {
  items: { id: string; name: string; isVehicle: boolean }[];
  userId: string;
  fromImport?: FromImport;
}) {
  const router = useRouter();
  const fid = useId();
  const [kind, setKind] = useState<ManualKind>("purchase");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [serviceItem, setServiceItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingPurchase | null>(null);
  const pending = useRef<{ input: PurchaseInput; form: HTMLFormElement } | null>(null);

  const sum = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const isVehicle = items.find((i) => i.id === serviceItem)?.isVehicle;

  function update(key: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /** The import whose documents get attached: the one we came from, or a newly chosen file. */
  async function attachment(file: FormDataEntryValue | null): Promise<string | undefined | null> {
    if (fromImport) return fromImport.id;
    if (!(file instanceof File) || file.size === 0) return undefined;
    const result = await uploadFile(userId, file);
    if (result.ok) return result.importId;
    if (result.reason === "duplicate" && result.importId) return result.importId;
    toast.error(result.reason === "duplicate" ? "That file is already attached to a record." : result.message);
    return null;
  }

  // Pages stay mounted after navigation (Activity), so clear the form once it's saved.
  async function save(
    e: FormEvent<HTMLFormElement>,
    run: (form: FormData, importId?: string) => Promise<boolean>,
  ) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    if (!isSupabaseConfigured) {
      toast.success(kind === "purchase" ? "Purchase saved" : "Service event saved");
      router.push(kind === "purchase" ? "/purchases" : `/items/${serviceItem}`);
      return;
    }
    setSaving(true);
    try {
      const importId = await attachment(form.get("file"));
      if (importId !== null && (await run(form, importId))) {
        formElement.reset();
        setLines([newLine()]);
        setServiceItem("");
      }
    } finally {
      setSaving(false);
    }
  }

  const savePurchase = (e: FormEvent<HTMLFormElement>) => {
    const formElement = e.currentTarget;
    return save(e, async (form, importId) => {
      const input: PurchaseInput = {
        merchant: text(form, "merchant"),
        orderDate: text(form, "date"),
        orderRef: optionalText(form, "ref"),
        invoiceRef: optionalText(form, "invoice"),
        importId,
        items: lines.map((l) => ({ name: l.name, category: l.category, price: optionalNumber(l.price) })),
      };
      const result = await createPurchase(input);
      if (!result.ok) {
        // Same order or invoice number as a saved purchase: ask before overriding it.
        if (result.existing) {
          pending.current = { input, form: formElement };
          setExisting(result.existing);
        } else {
          toast.error(result.message);
        }
        return false;
      }
      toast.success("Purchase saved");
      router.push(`/purchases/${result.id}`);
      return true;
    });
  };

  async function replaceExisting(old: ExistingPurchase) {
    setExisting(null);
    const p = pending.current;
    if (!p) return;
    setSaving(true);
    try {
      const result = await createPurchase({ ...p.input, replaceOrderId: old.id });
      if (!result.ok) return toast.error(result.message);
      pending.current = null;
      p.form.reset();
      setLines([newLine()]);
      toast.success("Purchase replaced");
      router.push(`/purchases/${result.id}`);
    } finally {
      setSaving(false);
    }
  }

  const saveService = (e: FormEvent<HTMLFormElement>) =>
    save(e, async (form, importId) => {
      const result = await createServiceEvent({
        itemId: serviceItem,
        serviceDate: text(form, "date"),
        workPerformed: text(form, "work"),
        provider: optionalText(form, "provider"),
        totalCost: Number(text(form, "cost")),
        odometerKm: optionalNumber(text(form, "odometer")),
        notes: optionalText(form, "notes"),
        parts: text(form, "parts")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
        importId,
      });
      if (!result.ok) {
        toast.error(result.message);
        return false;
      }
      toast.success("Service event saved");
      router.push(`/items/${serviceItem}`);
      return true;
    });

  const fileField = (label: string) =>
    fromImport ? null : (
      <Field id={`${fid}-file`} label={label} optional>
        <Input id={`${fid}-file`} name="file" type="file" accept=".pdf,image/*" />
      </Field>
    );

  return (
    <Card className="gap-0 p-6">
      <ReplacePurchaseDialog existing={existing} onCancel={() => setExisting(null)} onReplace={replaceExisting} />
      {fromImport && (
        <Alert className="mb-6">
          <Paperclip />
          <AlertTitle>Saving from {fromImport.title}</AlertTitle>
          <AlertDescription>
            The uploaded file will be attached to what you save, and the import marked as done.
          </AlertDescription>
        </Alert>
      )}
      <Tabs value={kind} onValueChange={(v) => setKind(v as ManualKind)} className="mb-6">
        <TabsList>
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
          <TabsTrigger value="service">Service event</TabsTrigger>
        </TabsList>
      </Tabs>

      {kind === "purchase" ? (
        <form onSubmit={savePurchase} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${fid}-merchant`} label="Bought from">
              <Input id={`${fid}-merchant`} name="merchant" required placeholder="Store or website" />
            </Field>
            <Field id={`${fid}-date`} label="Purchase date">
              <Input id={`${fid}-date`} name="date" type="date" required />
            </Field>
            <Field id={`${fid}-ref`} label="Order number" optional>
              <Input id={`${fid}-ref`} name="ref" />
            </Field>
            <Field id={`${fid}-invoice`} label="Invoice number" optional>
              <Input id={`${fid}-invoice`} name="invoice" />
            </Field>
            {fileField("Invoice")}
          </div>

          <fieldset className="grid gap-3">
            <legend className="mb-3 text-sm font-medium">Items</legend>
            {lines.map((l, i) => (
              <div key={l.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_7rem_auto] sm:border-0 sm:p-0">
                <Input
                  aria-label={`Item ${i + 1} name`}
                  placeholder="Item name, e.g. Refrigerator"
                  required
                  value={l.name}
                  onChange={(e) => update(l.key, { name: e.target.value })}
                />
                <NativeSelect
                  aria-label={`Item ${i + 1} category`}
                  wrapperClassName="w-full"
                  value={l.category}
                  onChange={(e) => update(l.key, { category: e.target.value as Category })}
                >
                  {CATEGORIES.map((c) => (
                    <NativeSelectOption key={c}>{c}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  aria-label={`Item ${i + 1} price`}
                  placeholder="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.price}
                  onChange={(e) => update(l.key, { price: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove item ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
                <Plus /> Add another item
              </Button>
              <span className="text-sm text-muted-foreground">
                Total <span className="font-medium text-foreground tabular-nums">{formatMoney(sum)}</span>
              </span>
            </div>
          </fieldset>

          <p className="text-xs text-muted-foreground">
            Add a warranty from the item page once it&rsquo;s saved, ideally with the warranty
            card attached.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save purchase"}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={saveService} className="grid gap-4 sm:grid-cols-2">
          <Field id={`${fid}-svc-item`} label="Item serviced" className="sm:col-span-2">
            <NativeSelect
              id={`${fid}-svc-item`}
              required
              wrapperClassName="w-full"
              value={serviceItem}
              onChange={(e) => setServiceItem(e.target.value)}
            >
              <NativeSelectOption value="">
                {items.length ? "Choose an item…" : "Save a purchase first to add its service"}
              </NativeSelectOption>
              {items.map((it) => (
                <NativeSelectOption key={it.id} value={it.id}>
                  {it.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id={`${fid}-svc-work`} label="Work performed" className="sm:col-span-2">
            <Input id={`${fid}-svc-work`} name="work" required placeholder="e.g. AC servicing, filter cleaned" />
          </Field>
          <Field id={`${fid}-svc-date`} label="Date">
            <Input id={`${fid}-svc-date`} name="date" type="date" required />
          </Field>
          <Field id={`${fid}-svc-provider`} label="Provider">
            <Input id={`${fid}-svc-provider`} name="provider" required placeholder="e.g. Urban Company" />
          </Field>
          <Field id={`${fid}-svc-parts`} label="Parts replaced" optional>
            <Input id={`${fid}-svc-parts`} name="parts" placeholder="Comma-separated" />
          </Field>
          <Field id={`${fid}-svc-cost`} label="Total cost">
            <Input id={`${fid}-svc-cost`} name="cost" type="number" min="0" step="0.01" required />
          </Field>
          {isVehicle && (
            <Field id={`${fid}-svc-odo`} label="Odometer (km)" optional>
              <Input id={`${fid}-svc-odo`} name="odometer" type="number" min="0" />
            </Field>
          )}
          {fileField("Receipt")}
          <Field id={`${fid}-svc-notes`} label="Notes" optional className="sm:col-span-2">
            <Textarea id={`${fid}-svc-notes`} name="notes" rows={2} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save service event"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Field({
  id,
  label,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
    </div>
  );
}
