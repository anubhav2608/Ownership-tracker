import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getImports } from "@/lib/mock-data";

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
