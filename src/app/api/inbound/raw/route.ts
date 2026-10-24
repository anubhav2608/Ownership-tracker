import { after } from "next/server";
import { ingestRawEmail, readStoredEmail } from "@/lib/inbound/ingest";
import { sha256 } from "@/lib/stored-documents";
import { createAdminClient } from "@/lib/supabase/admin";

// Emails sent by the user's own Google Apps Script (Settings → Gmail script):
// the raw message as the body, the user's personal key as a bearer token. The
// script runs in the user's Google account and sends only what they label;
// this app never gets access to Gmail.

export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const KEY = /^ik_[0-9a-f]{48}$/;

const json = (status: number, body: object) => Response.json(body, { status });

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error("[inbound/raw] not configured: set SUPABASE_SECRET_KEY");
    return json(503, { error: "not configured" });
  }

  const key = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!KEY.test(key)) return json(401, { error: "missing or malformed key" });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return json(413, { error: "email too large" });
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength === 0 || raw.byteLength > MAX_BYTES) {
    return json(raw.byteLength ? 413 : 400, { error: raw.byteLength ? "email too large" : "empty body" });
  }
  // A raw message starts with headers; anything else isn't an email.
  if (!/^[\x21-\x39\x3b-\x7e]+:/m.test(new TextDecoder().decode(raw.subarray(0, 2048)))) {
    return json(400, { error: "body is not a raw email (RFC 822)" });
  }

  const db = createAdminClient();
  const { data: profile, error } = await db
    .from("profiles")
    .select("id")
    .eq("inbound_key_hash", sha256(key))
    .maybeSingle();
  if (error) {
    console.error("[inbound/raw] key lookup failed:", error.message);
    return json(500, { error: "lookup failed" });
  }
  if (!profile) return json(401, { error: "unknown key" });

  try {
    const result = await ingestRawEmail(db, profile.id, raw);
    if (result.status === "stored") after(() => readStoredEmail(db, profile.id, result.importId));
    const url = new URL(`/imports/${result.importId}`, request.url).toString();
    return json(200, { status: result.status, importId: result.importId, url });
  } catch (e) {
    console.error("[inbound/raw] storing email failed:", e);
    return json(500, { error: "storing failed" });
  }
}
