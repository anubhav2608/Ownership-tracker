import type { Metadata } from "next";
import { CheckCircle2, Plus } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button, Card, CardHeader, inputClass, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Settings" };

const notificationPrefs = [
  { id: "processed", label: "A forwarded record is saved", on: true },
  { id: "review", label: "A record needs my review", on: true },
  { id: "return", label: "Return window closes in 2 days", on: true },
  { id: "warranty", label: "Warranty expires in 30 days", on: true },
  { id: "service", label: "Service is due", on: false },
];

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Forwarding address" />
          <div className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-sm">
                {currentUser.forwardingAddress}
              </code>
              <CopyButton value={currentUser.forwardingAddress} />
            </div>
            <Button variant="ghost" className="mt-3 h-8 px-2 text-xs text-muted">
              Generate a new address
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Verified senders" />
          <div className="p-5">
            <p className="text-sm text-muted">
              We only accept forwarded mail from these addresses.
            </p>
            <ul className="mt-4 space-y-2">
              {currentUser.verifiedSenders.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-accent" />
                  {s}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <input type="email" placeholder="Add another email address" className={inputClass} />
              <Button variant="secondary">
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Notify me when" />
          <ul className="divide-y divide-line">
            {notificationPrefs.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3 text-sm">
                  {p.label}
                  <input
                    type="checkbox"
                    defaultChecked={p.on}
                    className="size-4 accent-[var(--accent)]"
                  />
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
            <div>
              <p className="font-medium">{currentUser.name}</p>
              <p className="text-muted">{currentUser.email}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary">Export all data</Button>
              <Button variant="ghost" className="text-danger">
                Log out
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
