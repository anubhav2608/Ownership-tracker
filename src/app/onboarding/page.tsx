import type { Metadata } from "next";
import { ArrowRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Welcome" };

const steps = [
  {
    icon: Mail,
    title: "Forward a receipt",
    body: "From your inbox, forward any order confirmation, invoice or service bill to the address above.",
  },
  {
    icon: Sparkles,
    title: "We read it",
    body: "We pick out the merchant, items, price, date and warranty. Usually within a minute.",
  },
  {
    icon: ShieldCheck,
    title: "You confirm",
    body: "If we're unsure about anything, it waits in your Inbox for a quick check.",
  },
];

export default async function OnboardingPage() {
  const currentUser = await getCurrentUser();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-accent">Welcome, {currentUser.name}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          This is your private forwarding address
        </h1>
        <p className="mt-2 text-muted">
          Anything you forward here becomes a record. We only accept mail sent from{" "}
          <span className="font-medium text-fg">{currentUser.email}</span>, so nobody
          else can add to your account.
        </p>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-sm">
            {currentUser.forwardingAddress}
          </code>
          <CopyButton value={currentUser.forwardingAddress} label="Copy address" />
        </div>
        <p className="mt-2 text-xs text-muted">
          Tip: save it as a contact named &ldquo;Ownership&rdquo; so it autocompletes.
        </p>

        <ol className="mt-10 space-y-5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="font-medium">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/dashboard" className="h-11 px-5">
            Go to dashboard <ArrowRight className="size-4" />
          </LinkButton>
          <LinkButton href="/add?tab=upload" variant="secondary" className="h-11 px-5">
            Upload a receipt instead
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
