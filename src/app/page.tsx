import Link from "next/link";
import { FileSearch, History, Mail, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const features = [
  {
    icon: Mail,
    title: "Forward only what you choose",
    body: "Each account gets a private address. Forward a receipt and we turn it into a record. We never ask for access to your inbox.",
  },
  {
    icon: FileSearch,
    title: "Uploads work too",
    body: "PDFs and photos of paper receipts are read, and anything we're unsure of waits for you to check.",
  },
  {
    icon: Search,
    title: "Every retailer in one list",
    body: "Search purchases from every store by item, brand, merchant, serial or registration number.",
  },
  {
    icon: History,
    title: "Full service history",
    body: "Repairs, parts replaced and costs for each item, from home appliances to your car.",
  },
  {
    icon: ShieldCheck,
    title: "Warranty, with its source",
    body: "We show a warranty only when a document backs it, and link you to that document.",
  },
];

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
            O
          </span>
          Ownership
        </span>
        <Button asChild variant="ghost">
          <Link href="/login">Log in</Link>
        </Button>
      </header>

      <section className="py-16 md:py-24">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
          What you bought, and everything that happened to it since.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Invoices, warranties, refunds and service records are scattered across retailer
          apps, email and WhatsApp. Keep them in one searchable place instead.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/login?mode=signup">Get started free</Link>
          </Button>
          {isSupabaseConfigured ? (
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          ) : (
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">View demo</Link>
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
