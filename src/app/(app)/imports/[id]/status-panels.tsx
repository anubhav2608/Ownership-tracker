"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Ban, Clock, Copy, FileSearch, Link2, Loader2, RotateCw } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SectionCard } from "@/components/layout-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatDate, formatMoney } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ImportError, ImportRecord, Item, ServiceEvent } from "@/lib/types";
import { approveSender, deleteImport, processImport, retryImport, type ProcessResult } from "../actions";

// In demo mode (no Supabase) actions only confirm with a toast.

const NOTHING_CREATED = "The forwarded message or uploaded file is removed. No records were created from it.";

export function DiscardButton({
  importId,
  label = "Delete import",
  description = NOTHING_CREATED,
  saved,
}: {
  importId: string;
  label?: string;
  description?: string;
  /** What was saved from the import, offered for deletion with it. */
  saved?: "purchase" | "service";
}) {
  const router = useRouter();
  const fid = useId();
  const [open, setOpen] = useState(false);
  // On by default: deleting an import to read it again shouldn't leave the old record behind.
  const [alsoSaved, setAlsoSaved] = useState(true);
  const withSaved = Boolean(saved) && alsoSaved;

  async function discard() {
    if (isSupabaseConfigured && !(await deleteImport(importId, withSaved)).ok) {
      toast.error("Couldn't delete the import. Please try again.");
      return;
    }
    toast.success(withSaved ? `Import and its ${saved} deleted` : "Import deleted");
    router.push("/imports");
    // The list may have been shown before: fetch it again so the deleted import isn't in it.
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDelete
        open={open}
        onOpenChange={setOpen}
        title="Delete this import?"
        description={
          withSaved
            ? `The ${saved} saved from it is deleted too, with its documents unless something else uses them.`
            : description
        }
        onConfirm={discard}
      >
        {saved && (
          <Label htmlFor={`${fid}-also`} className="flex items-center gap-2 text-sm font-normal">
            <Checkbox id={`${fid}-also`} checked={alsoSaved} onCheckedChange={(v) => setAlsoSaved(v === true)} />
            Also delete the {saved} saved from it
          </Label>
        )}
      </ConfirmDelete>
    </>
  );
}

/** Runs the reader (or a retry) and reloads the page with the outcome. */
function useReader(importId: string) {
  const router = useRouter();
  const [reading, startReading] = useTransition();

  // Stays "reading" until the refreshed page arrives, so the old panel doesn't flash back.
  function run(action: (id: string) => Promise<ProcessResult>) {
    startReading(async () => {
      const result = await action(importId);
      if (!result.ok) toast.error(result.message);
      else if (result.status === "needs_review") toast.success("Read. Check the details and save.");
      else if (result.status === "failed") toast.error("We couldn't read this file.");
      else toast("This doesn't look like a receipt or invoice.");
      router.refresh();
    });
  }

  return { reading, run };
}

export function ProcessingPanel({
  importId,
  status,
}: {
  importId: string;
  status: "queued" | "processing";
}) {
  const { reading, run } = useReader(importId);

  if (status === "queued" && !reading) {
    return (
      <SectionCard title="Waiting to be read">
        <div className="space-y-4 px-5 py-4">
          <Alert>
            <Clock />
            <AlertTitle>Queued</AlertTitle>
            <AlertDescription>
              Your file is stored privately (open it under Source). Read it to fill in the
              details automatically; you&rsquo;ll check them before anything is saved.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => (isSupabaseConfigured ? run(processImport) : toast("Reading is simulated in the demo"))}>
              <FileSearch /> Read this document
            </Button>
            <Button asChild variant="outline">
              <Link href={`/add?tab=manual&import=${importId}`}>Enter the details manually</Link>
            </Button>
            <DiscardButton importId={importId} />
          </div>
        </div>
      </SectionCard>
    );
  }
  return (
    <div className="space-y-4">
      <Alert>
        <Loader2 className="animate-spin" />
        <AlertTitle>Processing</AlertTitle>
        <AlertDescription>
          We&rsquo;re reading this now. You can leave this page; it will show up under
          &ldquo;Needs you&rdquo; if anything needs checking.
        </AlertDescription>
      </Alert>
      {!reading && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/add?tab=manual&import=${importId}`}>Taking too long? Enter the details manually</Link>
          </Button>
          <DiscardButton importId={importId} />
        </div>
      )}
    </div>
  );
}

export function FailedPanel({
  importId,
  error,
  attempts,
  from,
}: {
  importId: string;
  error: ImportError;
  attempts: number;
  from?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const { reading, run } = useReader(importId);
  const unverified = error.code === "SENDER_NOT_VERIFIED";

  return (
    <SectionCard title="What went wrong">
      <div className="space-y-4 px-5 py-4">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{unverified ? "Sender not verified" : "We couldn't read this"}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
        {unverified && (
          <p className="text-sm text-muted-foreground">
            Only trust this sender if you forwarded this email yourself, for example from
            another address of yours. Their future emails will then be read automatically.
          </p>
        )}
        <p className="font-mono text-xs text-muted-foreground">
          {error.code} · failed at {error.stage.replace("_", " ")} · attempt {attempts}
        </p>
        {error.detail && (
          <p className="font-mono text-xs break-words text-muted-foreground">Details: {error.detail}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {unverified && from ? (
            <Button
              disabled={reading}
              onClick={() =>
                isSupabaseConfigured
                  ? run(approveSender)
                  : toast.success(`${from} verified. Import queued again.`)
              }
            >
              {reading && <Loader2 className="animate-spin" />}
              {reading ? "Reading…" : `Trust ${from} and read it`}
            </Button>
          ) : (
            error.retryable && (
              <Button
                disabled={retrying || reading}
                onClick={() => {
                  if (isSupabaseConfigured) return run(retryImport);
                  setRetrying(true);
                  toast.success(`Retry queued (attempt ${attempts + 1})`);
                }}
              >
                {reading ? <Loader2 className="animate-spin" /> : <RotateCw />}
                {reading ? "Reading…" : retrying ? "Retry queued" : "Retry"}
              </Button>
            )
          )}
          {!unverified && (
            <>
              <Button asChild variant="outline">
                <Link href="/add?tab=upload">Upload a better copy</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/add?tab=manual&import=${importId}`}>Enter manually</Link>
              </Button>
            </>
          )}
          <DiscardButton importId={importId} />
        </div>
      </div>
    </SectionCard>
  );
}

export function DuplicatePanel({
  importId,
  duplicateOf,
}: {
  importId: string;
  duplicateOf?: ImportRecord;
}) {
  return (
    <SectionCard title="Duplicate">
      <div className="space-y-4 px-5 py-4">
        <Alert>
          <Copy />
          <AlertTitle>Already imported</AlertTitle>
          <AlertDescription>
            This is the same message we imported on{" "}
            {duplicateOf ? formatDate(duplicateOf.receivedAt) : "an earlier date"}, so nothing
            new was created and this copy wasn&rsquo;t stored. Open the original to review or save it.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          {duplicateOf && (
            <Button asChild variant="outline">
              <Link href={`/imports/${duplicateOf.id}`}>View original import</Link>
            </Button>
          )}
          <DiscardButton importId={importId} />
        </div>
      </div>
    </SectionCard>
  );
}

export function UnsupportedPanel({ importId }: { importId: string }) {
  return (
    <SectionCard title="Not imported">
      <div className="space-y-4 px-5 py-4">
        <Alert>
          <Ban />
          <AlertTitle>This doesn&rsquo;t look like a receipt</AlertTitle>
          <AlertDescription>
            We import order confirmations, invoices, refund notices and service receipts.
            Promotions and newsletters are skipped.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/add?tab=manual&import=${importId}`}>It is a receipt: enter the details</Link>
          </Button>
          <DiscardButton importId={importId} />
        </div>
      </div>
    </SectionCard>
  );
}

export function ImportedPanel({
  record,
  orderMerchant,
  createdItems,
  serviceEvent,
  items,
}: {
  record: ImportRecord;
  orderMerchant?: string;
  createdItems: Item[];
  serviceEvent?: ServiceEvent;
  items: { id: string; name: string }[];
}) {
  const [relinking, setRelinking] = useState(false);
  const match = record.candidates?.[0];
  const linkedItem = items.find((i) => i.id === (serviceEvent?.itemId ?? match?.itemId));

  return (
    <SectionCard title="Created from this import">
      <ul className="divide-y">
        {record.result?.orderId && (
          <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>
              Purchase from <span className="font-medium">{orderMerchant}</span>
            </span>
            <Link href={`/purchases/${record.result.orderId}`} className="text-primary hover:underline">
              View
            </Link>
          </li>
        )}
        {createdItems.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>
              Item <span className="font-medium">{i.name}</span>
            </span>
            <Link href={`/items/${i.id}`} className="text-primary hover:underline">
              View
            </Link>
          </li>
        ))}
        {serviceEvent && (
          <li className="px-5 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>
                Service event{" "}
                <span className="font-medium">{serviceEvent.workPerformed}</span>,{" "}
                {formatMoney(serviceEvent.totalCost)}
              </span>
              <Link
                href={serviceEvent.itemId ? `/items/${serviceEvent.itemId}` : "/purchases#services"}
                className="text-primary hover:underline"
              >
                View
              </Link>
            </div>
            {linkedItem && (
              <div className="mt-3 rounded-md bg-muted px-3 py-2.5 text-xs">
                <p>
                  Linked to <span className="font-medium">{linkedItem.name}</span> because:
                </p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {match?.evidence.map((ev) => <li key={ev}>{ev}</li>)}
                </ul>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto px-0 text-xs"
                  onClick={() => setRelinking(true)}
                >
                  <Link2 /> Wrong item? Move it
                </Button>
              </div>
            )}
          </li>
        )}
      </ul>

      <div className="border-t px-5 py-3">
        <DiscardButton
          importId={record.id}
          description="Only the import record is removed. What it created stays, with the documents attached to it."
          saved={record.result?.orderId ? "purchase" : serviceEvent ? "service" : undefined}
        />
      </div>

      {relinking && (
        <RelinkDialog
          items={items}
          currentId={linkedItem?.id}
          onClose={() => setRelinking(false)}
        />
      )}
    </SectionCard>
  );
}

function RelinkDialog({
  items,
  currentId,
  onClose,
}: {
  items: { id: string; name: string }[];
  currentId?: string;
  onClose: () => void;
}) {
  const [target, setTarget] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move service event</DialogTitle>
          <DialogDescription>
            Choose the item this service was actually for. Its history and cost totals
            update on both items.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="relink">Item</Label>
          <NativeSelect
            id="relink"
            wrapperClassName="w-full"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <NativeSelectOption value="">Choose an item…</NativeSelectOption>
            {items
              .filter((i) => i.id !== currentId)
              .map((i) => (
                <NativeSelectOption key={i.id} value={i.id}>
                  {i.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            onClick={() => {
              toast.success(`Moved to ${items.find((i) => i.id === target)?.name}`);
              onClose();
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
