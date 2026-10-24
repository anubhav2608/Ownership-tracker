import { after } from "next/server";
import { Resend } from "resend";
import { forwardingTokens } from "@/lib/extraction/email";
import { ingestEmail, readStoredEmail } from "@/lib/inbound/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend's inbound webhook (spec §4A). Only signed deliveries are accepted. Mail
// is routed by the private forwarding address it was sent to; anything not
// addressed to a known user is acknowledged and dropped, so the endpoint never
// reveals which addresses exist. Reading happens after the response, so a slow
// PDF can't make Resend time out and redeliver.

export const maxDuration = 60;

const json = (status: number, body: object) => Response.json(body, { status });

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim();
  if (!apiKey || !secret || !domain || !process.env.SUPABASE_SECRET_KEY) {
    console.error("[inbound] not configured: set RESEND_API_KEY, RESEND_WEBHOOK_SECRET, INBOUND_EMAIL_DOMAIN and SUPABASE_SECRET_KEY");
    return json(503, { error: "not configured" });
  }

  const resend = new Resend(apiKey);
  const payload = await request.text();
  const header = (name: string) => request.headers.get(`svix-${name}`) ?? request.headers.get(`webhook-${name}`) ?? "";
  const deliveryId = header("id");

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id: deliveryId, timestamp: header("timestamp"), signature: header("signature") },
      webhookSecret: secret,
    });
  } catch {
    return json(401, { error: "invalid signature" });
  }
  if (event.type !== "email.received") return json(200, { ignored: event.type });

  const data = event.data;
  const tokens = forwardingTokens([...(data.received_for ?? []), ...data.to, ...(data.cc ?? [])], domain);
  if (tokens.length === 0) return json(200, { accepted: 0 });

  const db = createAdminClient();
  const { data: profiles, error } = await db.from("profiles").select("id").in("forwarding_token", tokens);
  if (error) {
    console.error("[inbound] looking up recipients failed:", error.message);
    return json(500, { error: "lookup failed" });
  }

  const toRead: { userId: string; importId: string }[] = [];
  try {
    for (const { id: userId } of profiles ?? []) {
      const result = await ingestEmail({
        db,
        resend,
        userId,
        eventId: `${deliveryId || data.email_id}:${userId}`,
        emailId: data.email_id,
      });
      if (result.status === "stored") toRead.push({ userId, importId: result.importId });
    }
  } catch (e) {
    // Resend retries failed deliveries; anything stored so far is recognised then.
    console.error("[inbound] storing email failed:", e);
    return json(500, { error: "storing failed" });
  }

  after(async () => {
    for (const { userId, importId } of toRead) await readStoredEmail(db, userId, importId);
  });
  return json(200, { accepted: profiles?.length ?? 0 });
}
