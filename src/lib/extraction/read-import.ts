import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Identifier } from "@/lib/types";
import { bodyLines, parseRawEmail } from "./email";
import { matchItems, type MatchableItem } from "./match";
import { parseDocument, type Extraction } from "./parse";
import { extractPdfText, PdfFileError } from "./pdf-text";

// Reads an import's documents: an uploaded file, or a forwarded email and its
// attachments. Shared by the "Read" action (as the signed-in user) and the
// inbound-email webhook (service role), so every query is scoped to the
// owner explicitly instead of relying on row level security alone.

type Db = SupabaseClient<Database>;
type ImportStatus = Database["public"]["Enums"]["import_status"];
type ImportStage = Database["public"]["Enums"]["import_stage"];

export interface Outcome {
  status: Extract<ImportStatus, "needs_review" | "failed" | "unsupported">;
  stage: ImportStage;
  document_kind?: Database["public"]["Enums"]["document_kind"];
  parser?: string;
  extracted?: Json;
  review_reasons?: string[];
  candidates?: Json;
  error?: { code: string; message: string; stage: ImportStage; retryable: boolean; detail?: string };
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const EMAIL = "message/rfc822";
const MAX_TEXT_LINES = 400;

/** An unexpected error while reading: retryable, with the reason kept for diagnosis. */
export function readingCrashed(e: unknown, what: "file" | "email"): Outcome {
  const outcome = failure("EXTRACTION_ERROR", `Something went wrong while reading this ${what}. Try again.`, true);
  outcome.error!.detail = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300);
  return outcome;
}

export const failure = (
  code: string,
  message: string,
  retryable: boolean,
  stage: ImportStage = "text_extracted",
): Outcome => ({
  status: "failed",
  stage: "received",
  error: { code, message, stage, retryable },
});

const FAILURES = {
  NO_FILE: ["The uploaded file is missing. Upload it again.", false],
  PDF_UNREADABLE: [
    "This PDF couldn't be opened. It may be damaged or password-protected. Enter the details yourself.",
    false,
  ],
  NO_TEXT_LAYER: [
    "This PDF is a scan with no text in it, which can't be read automatically yet. Enter the details yourself.",
    false,
  ],
  OCR_NOT_AVAILABLE: [
    "Photos can't be read automatically yet. Enter the details yourself; the photo stays attached.",
    false,
  ],
  TOO_LARGE: ["This PDF is too large to read.", false],
} as const;
type Problem = keyof typeof FAILURES;
/** When nothing could be read, the most useful explanation comes first. */
const PROBLEM_ORDER: Problem[] = ["PDF_UNREADABLE", "NO_TEXT_LAYER", "OCR_NOT_AVAILABLE", "TOO_LARGE"];

/** Whether mail from this address may be read into the user's account. */
export async function isVerifiedSender(db: Db, userId: string, email: string | null) {
  if (!email) return false;
  const { data } = await db
    .from("verified_senders")
    .select("id")
    .eq("user_id", userId)
    .eq("email", email.toLowerCase())
    .not("verified_at", "is", null)
    .maybeSingle();
  return Boolean(data);
}

export const unverifiedSender = (email: string | null) =>
  failure(
    "SENDER_NOT_VERIFIED",
    `${email ?? "The sender"} isn't one of your verified senders, so this email was held without being read.`,
    false,
    "verified",
  );

export async function readImport(db: Db, userId: string, importId: string): Promise<Outcome> {
  const { data: imp } = await db
    .from("imports")
    .select("source, from_email")
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!imp) return failure("NO_FILE", FAILURES.NO_FILE[0], false);
  if (imp.source === "email" && !(await isVerifiedSender(db, userId, imp.from_email))) {
    return unverifiedSender(imp.from_email);
  }

  const { data: docs } = await db
    .from("documents")
    .select("storage_path, mime_type, size_bytes")
    .eq("import_id", importId)
    .eq("user_id", userId)
    .order("created_at");
  if (!docs?.length) return failure("NO_FILE", FAILURES.NO_FILE[0], false);

  // An attached invoice is more complete than the email it came with, so PDFs go first.
  const rank = (mime: string) => (mime === "application/pdf" ? 0 : mime === EMAIL ? 1 : 2);
  const ordered = [...docs].sort((a, b) => rank(a.mime_type) - rank(b.mime_type));

  const problems = new Set<Problem>();
  let best: { extraction: Extraction; text: string } | undefined;
  // The text we found, kept so the import page can show what was read.
  let seen: string[] = [];

  for (const doc of ordered) {
    let lines: string[];
    if (doc.mime_type.startsWith("image/")) {
      problems.add("OCR_NOT_AVAILABLE");
      continue;
    } else if (doc.mime_type === "application/pdf") {
      if (doc.size_bytes > MAX_PDF_BYTES) {
        problems.add("TOO_LARGE");
        continue;
      }
      try {
        lines = (await extractPdfText(await download(db, doc.storage_path))).lines;
      } catch (e) {
        // Only a bad file is the user's to fix; anything else is our failure and can be retried.
        if (!(e instanceof PdfFileError)) throw e;
        problems.add("PDF_UNREADABLE");
        continue;
      }
    } else if (doc.mime_type === EMAIL) {
      lines = bodyLines(await parseRawEmail(await download(db, doc.storage_path)));
    } else {
      continue;
    }

    if (seen.length === 0) seen = lines;
    const parsed = parseDocument(lines);
    if (!parsed.ok) {
      if (parsed.reason === "no_text" && doc.mime_type === "application/pdf") problems.add("NO_TEXT_LAYER");
      continue;
    }
    const x = parsed.extraction;
    const complete = x.lines.length > 0 || x.documentKind === "service_receipt" || x.documentKind === "refund_notice";
    if (!best || (complete && best.extraction.lines.length === 0)) {
      best = { extraction: x, text: lines.join("\n") };
      seen = lines;
    }
    if (complete) break;
  }

  const text = seen.slice(0, MAX_TEXT_LINES);
  if (!best) {
    const problem = PROBLEM_ORDER.find((p) => problems.has(p));
    // An email (or file) with readable text that isn't a receipt is "unsupported", not an error.
    if (!problem) return { status: "unsupported", stage: "parsed", document_kind: "other", extracted: { text } };
    const [message, retryable] = FAILURES[problem];
    return { ...failure(problem, message, retryable), extracted: { text } };
  }

  const outcome = await review(db, userId, best.extraction, best.text);
  return { ...outcome, extracted: { ...(outcome.extracted as object), text } as unknown as Json };
}

async function review(db: Db, userId: string, x: Extraction, text: string): Promise<Outcome> {
  if (x.documentKind === "refund_notice") {
    return {
      ...failure(
        "REFUND_NOT_SUPPORTED",
        "This looks like a refund notice. Refunds can't be applied automatically yet: open the purchase and mark the item as returned.",
        false,
        "parsed",
      ),
      document_kind: "refund_notice",
      parser: x.parser,
    };
  }

  const reviewReasons = [...x.reviewReasons];
  let candidates: Json = [];

  if (x.documentKind === "service_receipt") {
    candidates = (await serviceCandidates(db, userId, text, x.fields.provider?.value ?? undefined)).map((c) => ({
      item_id: c.itemId,
      score: c.score,
      evidence: c.evidence,
    }));
    if ((candidates as unknown[]).length === 0) reviewReasons.push("Couldn't tell which item was serviced. Choose it below.");
  } else {
    const existing = await existingPurchase(db, userId, x.fields.orderRef?.value, x.fields.invoiceRef?.value);
    if (existing) {
      reviewReasons.unshift(
        `You already have this purchase from ${existing.merchant} (same ${existing.on} number). Saving will ask whether to replace it.`,
      );
    }
  }

  return {
    status: "needs_review",
    stage: "matched",
    document_kind: x.documentKind === "other" ? "invoice" : x.documentKind,
    parser: x.parser,
    extracted: { fields: x.fields, lines: x.lines, parts: x.parts } as unknown as Json,
    review_reasons: reviewReasons,
    candidates,
  };
}

/** A purchase of this user's with the same order or invoice number (case-insensitive). */
async function existingPurchase(db: Db, userId: string, orderRef?: string | null, invoiceRef?: string | null) {
  const exactly = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
  for (const [on, column, value] of [
    ["order", "order_ref", orderRef],
    ["invoice", "invoice_ref", invoiceRef],
  ] as const) {
    if (!value) continue;
    const { data } = await db
      .from("orders")
      .select("merchant")
      .eq("user_id", userId)
      .ilike(column, exactly(value))
      .limit(1)
      .maybeSingle();
    if (data) return { merchant: data.merchant, on };
  }
  return null;
}

async function download(db: Db, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from("documents").download(path);
  if (error || !data) throw new Error(`downloading ${path} failed: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function serviceCandidates(db: Db, userId: string, text: string, provider?: string) {
  const [{ data: items }, { data: events }] = await Promise.all([
    db.from("items").select("id, name, brand, model, identifiers").eq("user_id", userId).eq("status", "owned"),
    db.from("service_events").select("item_id, provider").eq("user_id", userId),
  ]);
  const matchable: MatchableItem[] = (items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    brand: i.brand ?? undefined,
    model: i.model ?? undefined,
    identifiers: (i.identifiers as unknown as Identifier[]) ?? [],
    providers: (events ?? []).filter((e) => e.item_id === i.id && e.provider).map((e) => e.provider!),
  }));
  return matchItems(text, matchable, provider);
}
