"use client";

import { useRouter } from "next/navigation";
import { MailCheck, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CopyButton, ForwardingAddress } from "@/components/copy-button";
import { SectionCard } from "@/components/layout-bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { finishForwarding } from "../imports/actions";
import { GmailScript, ORDER_WORDS, parseSenders } from "./gmail-script";

/** Remembered in this browser, so the filter and script can be copied again later. */
const SENDERS_STORE = "gmail-script-senders";

export interface ForwardingConfirmation {
  importId: string;
  receivedAt: string;
  gmail: string;
  code: string;
  link: string | null;
}

/** The Gmail search that picks out order emails from the user's senders. */
export const gmailFilterFor = (senders: string[]) => `from:(${senders.join(" OR ")}) subject:(${ORDER_WORDS})`;

/**
 * Settings → Automatic import from Gmail: the shops to import from, then two
 * ways to send their emails here without any access to the user's Gmail: a
 * Gmail filter that forwards them (no code), or the Apps Script.
 */
export function GmailSetup({
  forwardingAddress,
  forwardingReady,
  confirmation,
  verifiedSenders,
  gmailKey,
  defaultAppUrl,
}: {
  forwardingAddress: string;
  /** Whether this app receives mail sent to forwarding addresses. */
  forwardingReady: boolean;
  confirmation: ForwardingConfirmation | null;
  verifiedSenders: string[];
  gmailKey: { hint: string; createdAt: string } | null;
  defaultAppUrl: string;
}) {
  const fid = useId();
  const [sendersText, setSendersText] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SENDERS_STORE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is read after hydration
      if (saved) setSendersText(saved);
    } catch {}
  }, []);

  function changeSenders(value: string) {
    setSendersText(value);
    try {
      localStorage.setItem(SENDERS_STORE, value);
    } catch {}
  }

  const { senders, invalid } = parseSenders(sendersText);

  return (
    <SectionCard title="Automatic import from Gmail">
      <div className="space-y-5 p-5 text-sm">
        <div className="grid gap-2">
          <Label htmlFor={`${fid}-senders`}>Send automatically from these senders</Label>
          <Textarea
            id={`${fid}-senders`}
            value={sendersText}
            onChange={(e) => changeSenders(e.target.value)}
            rows={3}
            placeholder={"amazon.in\nmyntra.com\norders@shop.example"}
          />
          <p className="text-xs text-muted-foreground">
            One address or domain per line. Their emails with order, invoice or receipt in the subject
            come here by themselves. Ones that turn out not to be purchases, like shipping updates,
            are dropped.
          </p>
          {invalid.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Not an address or domain, left out: {invalid.join(", ")}
            </p>
          )}
        </div>

        <Tabs defaultValue="filter">
          <TabsList>
            <TabsTrigger value="filter">Gmail filter</TabsTrigger>
            <TabsTrigger value="script">Apps Script</TabsTrigger>
          </TabsList>
          {/* Kept mounted: a new script key is shown once and mustn't vanish on a tab switch. */}
          <TabsContent value="filter" forceMount className="pt-4 data-[state=inactive]:hidden">
            <GmailFilter
              senders={senders}
              forwardingAddress={forwardingAddress}
              forwardingReady={forwardingReady}
              confirmation={confirmation}
              verifiedSenders={verifiedSenders}
            />
          </TabsContent>
          <TabsContent value="script" forceMount className="pt-4 data-[state=inactive]:hidden">
            <GmailScript gmailKey={gmailKey} defaultAppUrl={defaultAppUrl} senders={senders} />
          </TabsContent>
        </Tabs>
      </div>
    </SectionCard>
  );
}

function GmailFilter({
  senders,
  forwardingAddress,
  forwardingReady,
  confirmation,
  verifiedSenders,
}: {
  senders: string[];
  forwardingAddress: string;
  forwardingReady: boolean;
  confirmation: ForwardingConfirmation | null;
  verifiedSenders: string[];
}) {
  const filter = gmailFilterFor(senders);
  const strong = "font-medium text-foreground";

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Set up once in Gmail, no code: a filter forwards new order emails from your senders to your
        private address here. Everyone using the app does this in their own Gmail.
      </p>
      {!forwardingReady && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Receiving email isn&rsquo;t set up on this app yet</AlertTitle>
          <AlertDescription>
            Whoever runs this app needs to connect an email-receiving service once (README: Forwarded
            emails). Until then, use the Apps Script tab.
          </AlertDescription>
        </Alert>
      )}
      <ol className="list-decimal space-y-4 pl-5 text-muted-foreground">
        <li className="space-y-2">
          <p>
            In Gmail, open <span className={strong}>Settings → See all settings → Forwarding and POP/IMAP</span>{" "}
            and click <span className={strong}>Add a forwarding address</span>. Paste:
          </p>
          <ForwardingAddress address={forwardingAddress} />
        </li>
        <li className="space-y-2">
          <p>
            Gmail sends a confirmation code to that address. It shows up here within a minute (reload
            this page). Enter it in Gmail and click <span className={strong}>Verify</span>. Leave
            forwarding of all mail turned off: the filter does the forwarding.
          </p>
          {confirmation ? (
            <Confirmation confirmation={confirmation} trusted={verifiedSenders.includes(confirmation.gmail)} />
          ) : (
            <p className="flex items-center gap-2 text-xs">
              <MailCheck className="size-3.5" /> No confirmation code waiting.
            </p>
          )}
        </li>
        <li className="space-y-2">
          <p>
            Open <span className={strong}>Filters and Blocked Addresses → Create a new filter</span>, paste
            this into <span className={strong}>Has the words</span>, click{" "}
            <span className={strong}>Create filter</span>, tick{" "}
            <span className={strong}>Forward it to</span> and choose your address.
          </p>
          {senders.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code aria-label="Filter for Gmail" className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                {filter}
              </code>
              <CopyButton value={filter} label="Copy filter" />
            </div>
          ) : (
            <p className="text-xs text-warning">Add your senders above to get the filter.</p>
          )}
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Filters forward new emails only. For older ones, upload the email (in Gmail: ⋮ → Download
        message) or use the Apps Script.
      </p>
    </div>
  );
}

function Confirmation({ confirmation: c, trusted }: { confirmation: ForwardingConfirmation; trusted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!isSupabaseConfigured) return toast.success("Done");
    setBusy(true);
    const result = await finishForwarding(c.importId, !trusted);
    setBusy(false);
    if (!result.ok) return toast.error(result.message ?? "Something went wrong. Please try again.");
    toast.success(trusted ? "Done" : `${c.gmail} trusted: what it forwards will be read.`);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-foreground">
      <p>
        <span className="font-medium">{c.gmail}</span> asked to forward here.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground">Confirmation code</span>
        <code aria-label="Confirmation code" className="rounded-md bg-background px-2 py-1 font-mono text-base tracking-wider">
          {c.code}
        </code>
        <CopyButton value={c.code} label="Copy code" />
        {c.link && (
          <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Or confirm on Google
          </a>
        )}
      </div>
      {!trusted && (
        <p className="text-xs text-muted-foreground">
          Only if {c.gmail} is your own Gmail: trusting it lets the emails it forwards be read.
        </p>
      )}
      <Button size="sm" onClick={finish} disabled={busy}>
        {busy ? "Saving…" : trusted ? "Done" : `Trust ${c.gmail} and finish`}
      </Button>
    </div>
  );
}
