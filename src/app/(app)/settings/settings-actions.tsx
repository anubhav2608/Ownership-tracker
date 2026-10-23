"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SectionCard } from "@/components/layout-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddSender() {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    toast.success(`Verification link sent to ${email}`);
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="mt-4 flex gap-2">
      <Input name="email" type="email" required placeholder="Add another email address" aria-label="Email address" />
      <Button type="submit" variant="outline">
        <Plus /> Add
      </Button>
    </form>
  );
}

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  return (
    <SectionCard title="Your data">
      <div className="space-y-4 p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground">
            Download every record and document as a ZIP.
          </p>
          <Button variant="outline" onClick={() => toast("Export started. We'll email you a link.")}>
            Export all data
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground">
            Permanently delete your account, records and documents.
          </p>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Delete account
          </Button>
        </div>
      </div>
      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your account?"
        description="All purchases, items, service history and stored documents are deleted, and your forwarding address stops working. This can't be undone."
        confirmLabel="Delete account"
        onConfirm={() => toast("Account deletion requested")}
      />
    </SectionCard>
  );
}
