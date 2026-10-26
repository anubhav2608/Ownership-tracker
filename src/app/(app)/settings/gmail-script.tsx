"use client";

import { useRouter } from "next/navigation";
import { KeyRound, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createGmailKey, revokeGmailKey } from "./gmail-script-actions";

const KEY_PLACEHOLDER = "PASTE_YOUR_KEY_HERE";
/** Subject words of the order emails sent automatically (Gmail search syntax). */
export const ORDER_WORDS =
  "order OR ordered OR invoice OR receipt OR bill OR purchase OR purchased OR payment OR booking";

/** A sender to send automatically: a domain ("amazon.in") or an address ("orders@shop.example"). */
const SENDER = /^([a-z0-9._%+-]+@)?([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** The senders typed in Settings, one per line or comma-separated; invalid ones are left out. */
export function parseSenders(text: string) {
  const all = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  return { senders: [...new Set(all.filter((s) => SENDER.test(s)))], invalid: all.filter((s) => !SENDER.test(s)) };
}

/** The Google Apps Script the user pastes into their own Google account. */
export function scriptFor(appUrl: string, key: string, senders: string[] = []) {
  return `// Ownership Tracker: sends the Gmail emails you label "Ownership" to your account,
// and order emails from the senders listed below.
// Runs in your Google account and sends only those; the app never gets access
// to your Gmail. Keep the key private: it lets anyone add imports.

const APP_URL = '${appUrl.replace(/\/+$/, "")}';
const KEY = '${key}';
const LABEL = 'Ownership';
const DONE = 'Ownership/Sent';
// Emails from these senders (an address, or a domain like 'amazon.in') are sent
// without labelling, when the subject mentions an order, invoice or receipt.
const SENDERS = [${senders.map((x) => `'${x}'`).join(", ")}];
const SUBJECT = '${ORDER_WORDS}';

// Run once: creates the labels, checks every 15 minutes, and sends what's there now
// (for the senders above, the last 30 days).
function setup() {
  label_(LABEL);
  label_(DONE);
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendLabelled')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendLabelled').timeBased().everyMinutes(15).create();
  sendLabelled(30);
}

function sendLabelled(days) {
  const label = label_(LABEL);
  const done = label_(DONE);
  for (const thread of label.getThreads(0, 20)) {
    if (sendThread_(thread, false)) {
      thread.removeLabel(label);
      thread.addLabel(done);
    }
  }
  if (SENDERS.length === 0) return;
  // Already-sent threads carry Ownership/Sent, so each email goes once.
  const query = 'from:(' + SENDERS.join(' OR ') + ') subject:(' + SUBJECT + ') newer_than:' +
    (typeof days === 'number' ? days : 3) + 'd -label:ownership-sent -in:spam -in:trash';
  for (const thread of GmailApp.search(query, 0, 30)) {
    if (sendThread_(thread, true)) thread.addLabel(done);
  }
}

// Sends a thread's emails; true when the app took them all. Failed ones are tried again.
function sendThread_(thread, auto) {
  let sent = true;
  for (const message of thread.getMessages()) {
    if (auto && !fromSender_(message.getFrom())) continue;
    // Without trailing slashes: "https://app.example//api/…" would redirect and lose the email.
    const response = UrlFetchApp.fetch(APP_URL.trim().replace(/\\/+$/, '') + '/api/inbound/raw', {
      method: 'post',
      contentType: 'message/rfc822',
      payload: message.getRawContent(),
      // "auto": the app drops it quietly if it isn't a purchase (e.g. "your order has shipped").
      headers: { Authorization: 'Bearer ' + KEY, 'X-Ownership-Auto': auto ? '1' : '0' },
      muteHttpExceptions: true,
      // A redirect would turn this POST into a GET and lose the email: report it instead.
      followRedirects: false,
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    // Only the app's own answer counts: a login page (e.g. Vercel's Deployment Protection) is a 200 too.
    let reply = null;
    try {
      reply = JSON.parse(text);
    } catch (e) {}
    const accepted = code === 200 && reply !== null && typeof reply.status === 'string';
    let note = '';
    if (code >= 300 && code < 400) {
      note = ' Redirected to ' + response.getHeaders()['Location'] + ': set APP_URL to the main https address of your app.';
    } else if (code === 200 && !accepted) {
      note = ' This is not the app: if it is a Vercel login page, turn off Vercel Authentication for your main domain (Vercel: Settings, Deployment Protection).';
    }
    console.log((auto ? '[auto] ' : '') + message.getSubject() + ' → ' + code + ' ' + (reply ? text : text.slice(0, 120).replace(/\\s+/g, ' ') + '…') + note);
    if (!accepted) sent = false;
  }
  return sent;
}

function fromSender_(from) {
  const address = (String(from).match(/<([^>]+)>/) || [null, String(from)])[1].trim().toLowerCase();
  return SENDERS.some((s) => s.includes('@') ? address === s : address.endsWith('@' + s) || address.endsWith('.' + s));
}

function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
`;
}

/** The Apps Script tab of Settings → Automatic import from Gmail. */
export function GmailScript({
  gmailKey,
  defaultAppUrl,
  senders,
}: {
  gmailKey: { hint: string; createdAt: string } | null;
  /** The address this page was requested at; on a laptop that's localhost, which Google can't reach. */
  defaultAppUrl: string;
  /** From the senders box above the tabs. */
  senders: string[];
}) {
  const router = useRouter();
  const fid = useId();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState(defaultAppUrl);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(appUrl);

  async function create() {
    if (!isSupabaseConfigured) return toast("Keys are created for real once Supabase is set up");
    setBusy(true);
    const result = await createGmailKey();
    setBusy(false);
    if (!result.ok) return toast.error(result.message);
    setNewKey(result.key);
    toast.success("Key created. Copy it now; it won't be shown again.");
    router.refresh();
  }

  async function revoke() {
    if (isSupabaseConfigured && !(await revokeGmailKey()).ok) return toast.error("Couldn't revoke the key.");
    setNewKey(null);
    toast.success("Key revoked. The script can't send emails any more.");
    router.refresh();
  }

  const script = scriptFor(appUrl || "https://your-app.example.com", newKey ?? KEY_PLACEHOLDER, senders);

  return (
    <>
      <div className="space-y-5 text-sm">
        <p className="text-muted-foreground">
          A small script in your own Google account sends the emails you label{" "}
          <span className="font-medium text-foreground">Ownership</span> to this app, with their
          attachments, every 15 minutes, and order emails from the senders above. Unlike a filter, it
          can also send older emails. It sends only those, and this app never gets access to your Gmail.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <KeyRound className="size-4 text-muted-foreground" />
          {gmailKey ? (
            <span>
              Key <code className="font-mono">{gmailKey.hint}</code>, created {formatDate(gmailKey.createdAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">No key yet.</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant={gmailKey ? "outline" : "default"} onClick={create} disabled={busy}>
              {busy ? "Creating…" : gmailKey ? "Replace key" : "Create key"}
            </Button>
            {gmailKey && (
              <Button size="sm" variant="ghost" onClick={() => setRevoking(true)}>
                Revoke
              </Button>
            )}
          </div>
        </div>

        {newKey && (
          <Alert>
            <KeyRound />
            <AlertTitle>Your key, shown once</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>It&rsquo;s already in the script below. Replacing it stops the old one working.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">{newKey}</code>
                <CopyButton value={newKey} label="Copy key" />
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor={`${fid}-url`}>This app&rsquo;s public address</Label>
          <Input
            id={`${fid}-url`}
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value.trim())}
            placeholder="https://your-app.vercel.app"
          />
          {local && (
            <p className="flex items-start gap-2 text-xs text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              The script runs on Google&rsquo;s servers, which can&rsquo;t reach localhost. Use your
              deployed address, or a tunnel to your computer (e.g. cloudflared tunnel --url
              http://localhost:3000).
            </p>
          )}
        </div>

        <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>{gmailKey || newKey ? "Copy the script below." : "Create a key, then copy the script below."}</li>
          <li>
            Open <span className="font-medium text-foreground">script.google.com</span> → New project,
            paste it over the sample code and save.
          </li>
          <li>
            Choose <span className="font-medium text-foreground">setup</span> in the toolbar and click Run.
            Google asks you to allow access to your Gmail for your own script; allow it.
          </li>
          <li>
            {senders.length > 0 ? "Emails from your senders arrive by themselves. For any other email, " : "In Gmail, "}
            add the <span className="font-medium text-foreground">Ownership</span> label to an
            order or invoice email. It shows up under Imports within 15 minutes, then moves to
            Ownership/Sent.
          </li>
        </ol>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Script</p>
            <CopyButton value={script} label="Copy script" />
          </div>
          <pre
            aria-label="Script for Apps Script"
            className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed"
          >
            {script}
          </pre>
          {!newKey && (
            <p className="text-xs text-muted-foreground">
              Keys are shown only when created. If you&rsquo;ve lost yours, replace it and update the
              script.{gmailKey && " Script already set up? To change senders, edit its SENDERS line in Apps Script instead."}
            </p>
          )}
        </div>
      </div>

      <ConfirmDelete
        open={revoking}
        onOpenChange={setRevoking}
        title="Revoke the Gmail key?"
        description="The script stops being able to send emails. Emails already imported stay."
        confirmLabel="Revoke"
        onConfirm={revoke}
      />
    </>
  );
}
