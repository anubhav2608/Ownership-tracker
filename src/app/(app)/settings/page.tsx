import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";
import { ForwardingAddress } from "@/components/copy-button";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { FormCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AddSender, DangerZone } from "./settings-actions";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      <div className="space-y-6">
        <Suspense fallback={<SettingsSkeleton />}>
          <AccountSettings />
        </Suspense>
        <DangerZone />
      </div>
    </div>
  );
}

async function AccountSettings() {
  const user = await getCurrentUser();
  return (
    <>
      <SectionCard title="Forwarding address">
        <div className="space-y-3 p-5">
          <ForwardingAddress address={user.forwardingAddress} />
          <p className="text-xs text-muted-foreground">
            Generating a new address stops the old one from accepting mail.
          </p>
          <Button variant="outline" size="sm">
            Generate a new address
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Verified senders">
        <div className="p-5">
          <p className="text-sm text-muted-foreground">
            We only import mail forwarded from these addresses. Anything else is held
            under Imports without being read.
          </p>
          <ul className="mt-4 space-y-2">
            {user.verifiedSenders.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-success" />
                {s}
              </li>
            ))}
          </ul>
          <AddSender />
        </div>
      </SectionCard>

      <SectionCard title="Account">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
          {isSupabaseConfigured ? (
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          ) : (
            <Button asChild variant="outline">
              <Link href="/">Leave demo</Link>
            </Button>
          )}
        </div>
      </SectionCard>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <FormCardSkeleton />
      <FormCardSkeleton />
    </>
  );
}
