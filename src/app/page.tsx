import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClipboardCheck, Lock, Mail, Route } from "lucide-react";
import { startDemo } from "@/app/demo/actions";
import { DemoButton } from "@/components/demo-button";
import { Button } from "@/components/ui/button";
import { CAR, daysAgo, SERVICES } from "@/lib/demo/sample-data";
import { formatDate, formatMoney } from "@/lib/format";

/** Dates are worked out from today, so it's read at request time, not at build. */
async function Timeline() {
  await connection();
  return (
    <ol className="mt-4 space-y-4">
      {[...SERVICES].reverse().map((s) => (
        <li key={s.daysAgo} className="flex gap-3">
          <span
            className="mt-1.5 size-2.5 shrink-0 rounded-full bg-chart-services"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{s.work}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(daysAgo(s.daysAgo))} ·{" "}
              {s.odometerKm.toLocaleString("en-IN")} km · {s.provider}
            </p>
          </div>
          <span className="text-sm tabular-nums">{formatMoney(s.total)}</span>
        </li>
      ))}
    </ol>
  );
}

const steps = [
  {
    icon: Mail,
    title: "Forward the invoice",
    body: "Each account gets a private address. Forward the service centre's email or upload its PDF.",
  },
  {
    icon: ClipboardCheck,
    title: "Check what we read",
    body: "Dates, kilometres, parts and cost are filled in. Only what we're unsure of is highlighted.",
  },
  {
    icon: Route,
    title: "See the timeline",
    body: "Every visit joins the car's history, ready for the next service, a warranty claim or resale.",
  },
];

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-primary to-[oklch(0.5_0.13_240)] text-sm text-primary-foreground shadow-sm">
            O
          </span>
          Ownership
        </span>
        <Button asChild variant="ghost">
          <Link href="/login">Log in</Link>
        </Button>
      </header>

      <section className="grid items-center gap-10 py-12 md:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-medium text-primary">For car owners</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Your car&rsquo;s full service history, built from the invoices you
            already get.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Forward a service invoice. We read it, you check it in seconds, and
            every visit lands on one timeline: date, kilometres, parts and cost.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <form action={startDemo}>
              <DemoButton />
            </form>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            No sign-up for the demo. Sample records, and we never ask for access
            to your inbox.
          </p>
        </div>

        {/* What you get: the car and its timeline, from the demo's own records. */}
        <div
          className="rounded-2xl border bg-card p-5 shadow-sm"
          aria-label="Example: a car's service timeline"
        >
          <div className="flex items-center gap-3 border-b pb-4">
            <span
              className="hue-tile flex size-11 items-center justify-center rounded-xl"
              style={{ "--h": 25 } as React.CSSProperties}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 16V11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11v5M3 16h18M7 16v2M17 16v2" />
                <circle cx="7.5" cy="13" r="0.6" />
                <circle cx="16.5" cy="13" r="0.6" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{CAR.name}</p>
              <p className="text-xs text-muted-foreground">
                {CAR.registration} · under warranty
              </p>
            </div>
          </div>
          <Suspense fallback={<div className="mt-4 h-40" aria-hidden />}>
            <Timeline />
          </Suspense>
          <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
            Sample records from the demo.{" "}
            {formatMoney(SERVICES.reduce((t, s) => t + s.total, 0))} spent on
            servicing so far.
          </p>
        </div>
      </section>

      <section className="pb-14">
        <h2 className="text-sm font-medium text-muted-foreground">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-xl border bg-card p-5">
              <span className="flex items-center gap-2 text-xs font-medium text-primary">
                <Icon className="size-4" aria-hidden />
                Step {i + 1}
              </span>
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t py-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy policy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms of use
        </Link>
      </footer>
    </div>
  );
}
