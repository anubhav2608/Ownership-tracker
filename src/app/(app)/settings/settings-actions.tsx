"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Download, Plus, RefreshCw, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SectionCard } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { addSender, deleteAccount, regenerateForwardingAddress, removeSender } from "./account-actions";

const DEMO = "This works once Supabase is set up; the demo doesn't change.";

/** Verified and waiting addresses, with remove buttons and a form to add one. */
export function Senders({
  verified,
  pending,
  forwardingAddress,
}: {
  verified: string[];
  pending: string[];
  forwardingAddress: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    if (!isSupabaseConfigured) return toast(DEMO);
    setBusy(true);
    const result = await addSender(email);
    setBusy(false);
    if (!result.ok) return toast.error(result.message);
    form.reset();
    toast.success(`Added. Send any email from ${email} to your app address to confirm it.`);
    router.refresh();
  }

  async function remove(email: string) {
    if (!isSupabaseConfigured) return toast(DEMO);
    const result = await removeSender(email);
    if (!result.ok) return toast.error(result.message);
    toast.success(`${email} removed`);
    router.refresh();
  }

  const row = (email: string, waiting: boolean) => (
    <li key={email} className="flex items-center gap-2 text-sm">
      {waiting ? (
        <Clock className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      )}
      <span className="min-w-0 truncate">{email}</span>
      {waiting && <span className="text-xs text-muted-foreground">waiting for an email from it</span>}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-7 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${email}`}
        onClick={() => remove(email)}
      >
        <X />
      </Button>
    </li>
  );

  return (
    <>
      <ul className="mt-4 space-y-2">
        {verified.map((e) => row(e, false))}
        {pending.map((e) => row(e, true))}
      </ul>
      {pending.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          To confirm an address, send or forward any email from it to {forwardingAddress}. It&rsquo;s
          confirmed when that email arrives.
        </p>
      )}
      <form onSubmit={add} className="mt-4 flex gap-2">
        <Input name="email" type="email" required placeholder="Add another email address" aria-label="Email address" />
        <Button type="submit" variant="outline" disabled={busy}>
          <Plus /> {busy ? "Adding…" : "Add"}
        </Button>
      </form>
    </>
  );
}

/** A new private forwarding address; the old one stops accepting mail. */
export function RegenerateAddress() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function regenerate() {
    if (!isSupabaseConfigured) return void toast(DEMO);
    const result = await regenerateForwardingAddress();
    if (!result.ok) return void toast.error(result.message);
    toast.success("New address created. Update it in Gmail's forwarding settings and filter.");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw /> Generate a new address
      </Button>
      <ConfirmDelete
        open={open}
        onOpenChange={setOpen}
        title="Generate a new address?"
        description="The current address stops accepting mail at once. If Gmail forwards to it, add the new address in Gmail's forwarding settings and change your filter to use it."
        confirmLabel="Generate new address"
        onConfirm={regenerate}
      />
    </>
  );
}

export function DangerZone() {
  const router = useRouter();
  const fid = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!isSupabaseConfigured) return void toast(DEMO);
    setDeleting(true);
    const result = await deleteAccount();
    if (!result.ok) {
      setDeleting(false);
      return void toast.error(result.message);
    }
    // Signed out now: nothing of the old account should stay on screen.
    router.replace("/login");
    router.refresh();
  }

  return (
    <SectionCard title="Your data">
      <div className="space-y-4 p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground">Download every record and document as a ZIP.</p>
          {isSupabaseConfigured ? (
            <Button asChild variant="outline">
              <a href="/api/export" download>
                <Download /> Export all data
              </a>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => toast(DEMO)}>
              <Download /> Export all data
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground">Permanently delete your account, records and documents.</p>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => {
              setTyped("");
              setConfirming(true);
            }}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </div>
      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your account?"
        description="All purchases, items, service history and stored documents are deleted, and your forwarding address stops working. This can't be undone. Export your data first if you want a copy."
        confirmLabel="Delete account"
        confirmDisabled={typed.trim().toUpperCase() !== "DELETE"}
        onConfirm={remove}
      >
        <div className="grid gap-2">
          <Label htmlFor={`${fid}-confirm`}>Type DELETE to confirm</Label>
          <Input id={`${fid}-confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDelete>
    </SectionCard>
  );
}
