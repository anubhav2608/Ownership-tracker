import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DemoBanner } from "@/components/demo-banner";
import { getImports } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** The demo's guide, only for a demo visitor (an anonymous account). */
async function DemoGuide() {
  if (!isSupabaseConfigured) return null;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.is_anonymous) return null;
  const { data: car } = await db.from("items").select("id").eq("category", "vehicle").limit(1).maybeSingle();
  // Their own forwarding address, once Resend receiving is set up, so real mail can be forwarded to the demo.
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim();
  const ready = Boolean(domain && process.env.RESEND_WEBHOOK_SECRET);
  const { data: profile } = ready
    ? await db.from("profiles").select("forwarding_token").maybeSingle()
    : { data: null };
  const address = profile?.forwarding_token ? `${profile.forwarding_token}@${domain}` : undefined;
  return <DemoBanner carHref={car ? `/items/${car.id}` : undefined} forwardingAddress={address} />;
}

async function InboxCount({ variant }: { variant: "badge" | "dot" }) {
  const imports = await getImports();
  const count = imports.filter((r) => r.status === "needs_review" || r.status === "failed").length;
  if (count === 0) return null;
  return variant === "badge" ? (
    <span className="ml-auto rounded-full bg-warning-soft px-1.5 text-xs font-medium text-warning">
      {count}
    </span>
  ) : (
    <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-warning" />
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      inboxBadge={
        <Suspense>
          <InboxCount variant="badge" />
        </Suspense>
      }
      banner={
        <Suspense>
          <DemoGuide />
        </Suspense>
      }
      inboxDot={
        <Suspense>
          <InboxCount variant="dot" />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
