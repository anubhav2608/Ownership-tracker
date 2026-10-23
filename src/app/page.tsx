import { Bell, FileSearch, Mail, ShieldCheck, Wrench } from "lucide-react";
import { LinkButton } from "@/components/ui";

const features = [
  {
    icon: Mail,
    title: "Forward, don't type",
    body: "Forward order confirmations and invoices to your private address. We pull out the merchant, price, date and warranty.",
  },
  {
    icon: FileSearch,
    title: "Paper receipts too",
    body: "Upload a PDF or photo. We read it, and ask you to check anything we're not sure about.",
  },
  {
    icon: ShieldCheck,
    title: "Warranty at a glance",
    body: "See what's still covered, and get the invoice in two taps when something breaks.",
  },
  {
    icon: Wrench,
    title: "Full service history",
    body: "Every repair, service and installation for an item, in one timeline.",
  },
  {
    icon: Bell,
    title: "Reminders that matter",
    body: "Return windows, warranty expiry and service due dates, before they pass.",
  },
];

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-accent-fg">
            O
          </span>
          Ownership
        </span>
        <LinkButton href="/login" variant="ghost">
          Log in
        </LinkButton>
      </header>

      <section className="py-16 md:py-24">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
          Everything you own, with the paperwork attached.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          Purchases, invoices, warranties and service history for your gadgets,
          appliances and vehicles, built from the emails you already get.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/login?mode=signup" className="h-11 px-5">
            Get started free
          </LinkButton>
          <LinkButton href="/dashboard" variant="secondary" className="h-11 px-5">
            View demo
          </LinkButton>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-5">
            <Icon className="size-5 text-accent" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
