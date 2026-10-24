import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { ForwardingAddress } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/data";

export const metadata: Metadata = { title: "Welcome" };

const steps = [
  {
    icon: Mail,
    title: "Forward a receipt",
    body: "Forward an order confirmation, invoice, refund notice or service receipt to the address above. Only what you forward is ever seen.",
  },
  {
    icon: Sparkles,
    title: "We read it",
    body: "We pick out the merchant, items, prices and dates, plus a warranty only if the document states one."
  },
  {
    icon: ShieldCheck,
    title: "You confirm",
    body: "If we're unsure about anything, it waits in your Inbox for a quick check.",
  },
];

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <p className="text-sm font-medium text-primary">
          <Suspense fallback="Welcome">
            <WelcomeName />
          </Suspense>
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          This is your private forwarding address
        </h1>
        <Suspense fallback={<AddressSkeleton />}>
          <AddressDetails />
        </Suspense>
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: save it as a contact named &ldquo;Ownership&rdquo; so it autocompletes.
        </p>

        <ol className="mt-10 space-y-5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="font-medium">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Go to dashboard <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/add?tab=upload">Upload a receipt instead</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

async function WelcomeName() {
  const user = await getCurrentUser();
  return <>Welcome, {user.name}</>;
}

async function AddressDetails() {
  const user = await getCurrentUser();
  return (
    <>
      <p className="mt-2 text-muted-foreground">
        Anything you forward here becomes a record. We only accept mail sent from{" "}
        <span className="font-medium text-foreground">{user.email}</span>, so nobody else can
        add to your account.
      </p>

      <div className="mt-6 rounded-xl border bg-card p-4">
        <ForwardingAddress address={user.forwardingAddress} />
      </div>
    </>
  );
}

function AddressSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <Skeleton className="mt-6 h-20 rounded-xl" />
    </div>
  );
}
