import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ForwardingAddress } from "@/components/copy-button";
import { PageHeader, SectionCard } from "@/components/layout-bits";
import { FormCardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { GmailSetup } from "./gmail-setup";
import { DangerZone, RegenerateAddress, Senders } from "./settings-actions";

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
  const [user, requestHeaders] = await Promise.all([getCurrentUser(), headers()]);
  // Behind a proxy or tunnel the public host is in x-forwarded-host.
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <>
      <SectionCard title="Forwarding address">
        <div className="space-y-3 p-5">
          <ForwardingAddress address={user.forwardingAddress} />
          <p className="text-xs text-muted-foreground">
            Generating a new address stops the old one from accepting mail.
          </p>
          <RegenerateAddress />
        </div>
      </SectionCard>

      <GmailSetup
        forwardingAddress={user.forwardingAddress}
        forwardingReady={user.forwardingReady}
        confirmation={user.forwardingConfirmation}
        verifiedSenders={user.verifiedSenders}
        gmailKey={user.gmailKey}
        defaultAppUrl={`${proto}://${host}`}
      />

      <SectionCard title="Verified senders">
        <div className="p-5">
          <p className="text-sm text-muted-foreground">
            We only import mail forwarded from these addresses. Anything else is held
            under Imports without being read.
          </p>
          <Senders
            verified={user.verifiedSenders}
            pending={user.pendingSenders}
            forwardingAddress={user.forwardingAddress}
          />
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
