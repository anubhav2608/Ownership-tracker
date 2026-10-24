"use client";

import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ACCEPTED_FILES, storeFile, type StoredFile } from "@/app/(app)/add/upload-file";
import { attachDocuments, type AttachInput } from "@/lib/record-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const MAX_MB = 10;
const KINDS: { value: NonNullable<AttachInput["kind"]>; label: string }[] = [
  { value: "invoice", label: "Invoice" },
  { value: "order_confirmation", label: "Order confirmation" },
  { value: "warranty_card", label: "Warranty card" },
  { value: "service_receipt", label: "Service receipt" },
  { value: "refund_notice", label: "Refund notice" },
  { value: "other", label: "Miscellaneous" },
];

/** Attach one or more files to a purchase, item or service event. */
export function AttachDocuments({
  userId,
  target,
  label = "Add documents",
}: {
  userId: string;
  target: { orderId: string } | { itemId: string } | { serviceEventId: string };
  label?: string;
}) {
  const router = useRouter();
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState<NonNullable<AttachInput["kind"]>>("other");
  const [saving, setSaving] = useState(false);

  function close() {
    setOpen(false);
    setFiles([]);
    setKind("other");
  }

  function add(list: FileList | null) {
    if (!list) return;
    const ok = Array.from(list).filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (ok.length < list.length) toast.error(`Files over ${MAX_MB} MB were skipped`);
    setFiles((prev) => [...prev, ...ok]);
  }

  async function attach() {
    if (!isSupabaseConfigured) {
      toast.success(`${files.length} document${files.length > 1 ? "s" : ""} attached`);
      return close();
    }
    setSaving(true);
    try {
      const stored: StoredFile[] = [];
      for (const f of files) {
        const result = await storeFile(userId, f);
        if (result.ok) stored.push(result.file);
        else toast.error(result.message);
      }
      if (stored.length === 0) return;
      const result = await attachDocuments({ ...target, kind, files: stored });
      if (!result.ok) return toast.error(result.message);
      toast.success(`${result.attached} document${result.attached === 1 ? "" : "s"} attached`);
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Paperclip /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add documents</DialogTitle>
            <DialogDescription>
              Invoices, warranty cards, manuals, photos or saved emails. Choose as many as you like;
              they&rsquo;re stored privately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-files`}>Files</Label>
              <Input
                id={`${fid}-files`}
                type="file"
                multiple
                accept={ACCEPTED_FILES}
                onChange={(e) => {
                  add(e.target.files);
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="divide-y rounded-lg border">
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
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${fid}-kind`}>Type</Label>
              <NativeSelect
                id={`${fid}-kind`}
                wrapperClassName="w-full"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {KINDS.map((k) => (
                  <NativeSelectOption key={k.value} value={k.value}>
                    {k.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Anything that isn&rsquo;t one of these is filed under Miscellaneous.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={attach} disabled={files.length === 0 || saving}>
              {saving ? "Attaching…" : `Attach ${files.length || ""} ${files.length === 1 ? "file" : "files"}`.replace("  ", " ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
