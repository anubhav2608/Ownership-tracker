import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getInbox } from "@/lib/mock-data";

async function InboxCount({ variant }: { variant: "badge" | "dot" }) {
  const inbox = await getInbox();
  const count = inbox.filter((r) => r.status !== "processing").length;
  if (count === 0) return null;
  return variant === "badge" ? (
    <span className="ml-auto rounded-full bg-warn-soft px-1.5 text-xs font-medium text-warn">
      {count}
    </span>
  ) : (
    <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-warn" />
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
