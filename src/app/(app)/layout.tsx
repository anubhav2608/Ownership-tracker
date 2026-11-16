import { Suspense } from "react";
import { AppShell, SettingsSidebarLink, SettingsTopBarLink } from "@/components/app-shell";
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
  return <DemoBanner />;
}

/** Settings are for real accounts: a demo visitor (an anonymous account) doesn't see them. */
async function SettingsLink({ variant }: { variant: "sidebar" | "topBar" }) {
  if (isSupabaseConfigured) {
    const db = await createClient();
    const { data } = await db.auth.getClaims();
    if (data?.claims?.is_anonymous) return null;
  }
  return variant === "sidebar" ? <SettingsSidebarLink /> : <SettingsTopBarLink />;
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
      settings={{
        sidebar: (
          <Suspense>
            <SettingsLink variant="sidebar" />
          </Suspense>
        ),
        topBar: (
          <Suspense>
            <SettingsLink variant="topBar" />
          </Suspense>
        ),
      }}
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
