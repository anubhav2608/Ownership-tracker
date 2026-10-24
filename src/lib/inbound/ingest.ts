import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { bodyOnlyEmail, emailAddress, parseRawEmail } from "@/lib/extraction/email";
import { isVerifiedSender, readImport, readingCrashed, unverifiedSender, type Outcome } from "@/lib/extraction/read-import";
import {
  extensionFor,
  isKeptType,
  keptAttachments,
  MAX_ATTACHMENT_BYTES,
  sha256,
  storeDocument,
  type Attachment,
} from "@/lib/stored-documents";
import type { Database, Json } from "@/lib/supabase/database.types";

// Stores one forwarded email for one user (spec §4A, §4B): the message itself,
// its PDF and image attachments as documents, and an import to track it.
// Runs with the service role, so every query names the user.

type Db = SupabaseClient<Database>;

export type IngestResult =
  | { status: "redelivered" | "duplicate" | "held"; importId: string }
  | { status: "stored"; importId: string };

export async function ingestEmail({
  db,
  resend,
  userId,
  eventId,
  emailId,
}: {
  db: Db;
  resend: Resend;
  userId: string;
  /** Unique per webhook delivery and user, so a redelivery is recognised. */
  eventId: string;
  emailId: string;
}): Promise<IngestResult> {
  const existing = await findImport(db, userId, "inbound_event_id", eventId);
  if (existing) return { status: "redelivered", importId: existing };

  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error || !email) throw new Error(`fetching received email failed: ${error?.message}`);

  const raw = email.raw?.download_url ? await fetchBytes(email.raw.download_url) : null;
  const parsed = raw ? await parseRawEmail(raw) : null;
  return storeEmail(db, userId, {
    eventId,
    raw,
    from: email.from,
    to: email.to,
    date: email.created_at,
    subject: email.subject?.trim() || parsed?.subject || "(no subject)",
    messageId: email.message_id || parsed?.messageId || null,
    html: email.html ?? parsed?.html ?? null,
    text: email.text ?? parsed?.text ?? null,
    attachments: parsed ? parsed.attachments : await fetchAttachments(resend, emailId),
    senderTrusted: false,
  });
}

/**
 * Stores a raw email sent by the user's own Gmail script (with their personal
 * key). The key proves who sent it, so the original sender (a shop) needn't be
 * a verified sender.
 */
export async function ingestRawEmail(db: Db, userId: string, raw: Uint8Array): Promise<IngestResult> {
  // The same message sent again (a script retry) is the same delivery.
  const eventId = `raw:${userId}:${sha256(raw)}`;
  const existing = await findImport(db, userId, "inbound_event_id", eventId);
  if (existing) return { status: "redelivered", importId: existing };

  const parsed = await parseRawEmail(raw);
  const date = parsed.date && !Number.isNaN(Date.parse(parsed.date)) ? new Date(parsed.date).toISOString() : new Date().toISOString();
  return storeEmail(db, userId, {
    eventId,
    raw,
    from: parsed.fromHeader ?? parsed.from ?? "",
    to: parsed.to,
    date,
    subject: parsed.subject,
    messageId: parsed.messageId,
    html: parsed.html,
    text: parsed.text,
    attachments: parsed.attachments,
    senderTrusted: true,
  });
}

interface IncomingEmail {
  eventId: string;
  raw: Uint8Array | null;
  /** The From header as sent ("Shop <orders@shop.example>"). */
  from: string;
  to: string[];
  date: string;
  subject: string;
  messageId: string | null;
  html: string | null;
  text: string | null;
  attachments: Attachment[];
  /** Sent with the user's own key, so the sender needn't be verified. */
  senderTrusted: boolean;
}

async function storeEmail(db: Db, userId: string, email: IncomingEmail): Promise<IngestResult> {
  const { eventId, raw, subject, messageId, html, text } = email;
  const from = emailAddress(email.from);
  const attachments = keptAttachments(email.attachments);

  const base = {
    user_id: userId,
    source: "email" as const,
    title: subject.slice(0, 300),
    from_email: from,
    message_id: messageId,
    inbound_event_id: eventId,
    sender_trusted: email.senderTrusted,
  };

  // The same message forwarded again, or the same attachments sent again.
  const rawHash = raw ? sha256(raw) : null;
  const duplicateOf =
    (messageId && (await findImport(db, userId, "message_id", messageId))) ||
    (rawHash && (await findImport(db, userId, "content_sha256", rawHash))) ||
    (await duplicateAttachmentsImport(db, userId, attachments));
  if (duplicateOf) {
    const { data: dup, error: dupError } = await db
      .from("imports")
      .insert({ ...base, status: "duplicate", stage: "received", duplicate_of: duplicateOf, message_id: null })
      .select("id")
      .single();
    if (dupError) throw new Error(`recording duplicate failed: ${dupError.message}`);
    return { status: "duplicate", importId: dup.id };
  }

  const { data: imp, error: importError } = await db
    .from("imports")
    .insert({ ...base, content_sha256: rawHash })
    .select("id")
    .single();
  if (importError) {
    // Two deliveries racing: the other one created it.
    const again = importError.code === "23505" && (await findImport(db, userId, "inbound_event_id", eventId));
    if (again) return { status: "redelivered", importId: again };
    throw new Error(`creating import failed: ${importError.message}`);
  }

  try {
    if (raw) {
      const rawPath = `${userId}/${imp.id}.eml`;
      const { error: rawError } = await db.storage
        .from("inbound-raw")
        .upload(rawPath, raw, { contentType: "message/rfc822" });
      if (!rawError) await db.from("imports").update({ raw_storage_path: rawPath }).eq("id", imp.id).eq("user_id", userId);
    }

    const message = bodyOnlyEmail({
      from: email.from,
      to: email.to,
      subject,
      date: email.date,
      messageId,
      html,
      text,
    });
    await storeDocument(db, userId, imp.id, {
      fileName: `${subject.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120).trim() || "email"}.eml`,
      mimeType: "message/rfc822",
      content: new TextEncoder().encode(message),
    });
    for (const a of attachments) await storeDocument(db, userId, imp.id, a);
  } catch (e) {
    await removeImport(db, userId, imp.id);
    throw e;
  }

  if (!email.senderTrusted && !(await isVerifiedSender(db, userId, from))) {
    await recordOutcome(db, userId, imp.id, unverifiedSender(from));
    return { status: "held", importId: imp.id };
  }
  return { status: "stored", importId: imp.id };
}

/** Reads a stored email now; the outcome is written straight onto the import. */
export async function readStoredEmail(db: Db, userId: string, importId: string): Promise<Outcome["status"]> {
  await db
    .from("imports")
    .update({ status: "processing", stage: "received", error: null })
    .eq("id", importId)
    .eq("user_id", userId)
    .eq("status", "queued");

  let outcome: Outcome;
  try {
    outcome = await readImport(db, userId, importId);
  } catch (e) {
    console.error("[inbound] reading failed:", e);
    outcome = readingCrashed(e, "email");
  }
  await recordOutcome(db, userId, importId, outcome);
  return outcome.status;
}

async function recordOutcome(db: Db, userId: string, importId: string, o: Outcome) {
  const { error } = await db
    .from("imports")
    .update({
      status: o.status,
      stage: o.stage,
      attempts: 1,
      document_kind: o.document_kind ?? null,
      parser: o.parser ?? null,
      extracted: (o.extracted ?? {}) as NonNullable<Json>,
      candidates: (o.candidates ?? []) as NonNullable<Json>,
      review_reasons: o.review_reasons ?? [],
      error: (o.status === "failed" ? o.error : null) as Json,
    })
    .eq("id", importId)
    .eq("user_id", userId);
  if (error) throw new Error(`recording outcome failed: ${error.message}`);
  if (o.document_kind && o.document_kind !== "other") {
    await db
      .from("documents")
      .update({ kind: o.document_kind })
      .eq("import_id", importId)
      .eq("user_id", userId)
      .eq("kind", "other")
      .neq("mime_type", "message/rfc822");
  }
}

async function findImport(
  db: Db,
  userId: string,
  column: "inbound_event_id" | "message_id" | "content_sha256",
  value: string,
) {
  let query = db.from("imports").select("id").eq("user_id", userId).eq(column, value);
  // A redelivery may be of an email we recorded as a duplicate; other matches must be originals.
  if (column !== "inbound_event_id") query = query.is("duplicate_of", null);
  const { data } = await query.limit(1).maybeSingle();
  return data?.id ?? null;
}

/** If every PDF attached was imported before, the import it came with. */
async function duplicateAttachmentsImport(db: Db, userId: string, attachments: Attachment[]) {
  const pdfs = attachments.filter((a) => a.mimeType === "application/pdf");
  if (pdfs.length === 0) return null;
  const { data } = await db
    .from("documents")
    .select("sha256, import_id")
    .eq("user_id", userId)
    .in("sha256", pdfs.map((a) => sha256(a.content)));
  if (!data || data.length < new Set(pdfs.map((a) => sha256(a.content))).size) return null;
  return data.find((d) => d.import_id)?.import_id ?? null;
}

async function removeImport(db: Db, userId: string, importId: string) {
  const { data: docs } = await db
    .from("documents")
    .select("id, storage_path")
    .eq("import_id", importId)
    .eq("user_id", userId);
  if (docs?.length) {
    await db.storage.from("documents").remove(docs.map((d) => d.storage_path));
    await db.from("documents").delete().in("id", docs.map((d) => d.id)).eq("user_id", userId);
  }
  await db.storage.from("inbound-raw").remove([`${userId}/${importId}.eml`]);
  await db.from("imports").delete().eq("id", importId).eq("user_id", userId);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Used when the raw message isn't available: the attachments API gives signed download links. */
async function fetchAttachments(resend: Resend, emailId: string): Promise<Attachment[]> {
  const { data, error } = await resend.emails.receiving.attachments.list({ emailId });
  if (error || !data) throw new Error(`listing attachments failed: ${error?.message}`);
  const out: Attachment[] = [];
  for (const a of data.data) {
    if (a.content_disposition === "inline" || !isKeptType(a.content_type) || a.size > MAX_ATTACHMENT_BYTES) continue;
    out.push({
      fileName: a.filename || `attachment.${extensionFor(a.content_type)}`,
      mimeType: a.content_type,
      content: await fetchBytes(a.download_url),
    });
  }
  return out;
}
