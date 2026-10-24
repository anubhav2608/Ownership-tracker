"use server";

import { z } from "zod";
import { extractPdfText } from "@/lib/extraction/pdf-text";
import { matchItems, type MatchableItem } from "@/lib/extraction/match";
import { parseDocument } from "@/lib/extraction/parse";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Identifier } from "@/lib/types";

const id = z.uuid();

/** Short-lived link to a stored document; the bucket itself is private. */
export async function getDocumentUrl(documentId: string): Promise<string | null> {
  if (!id.safeParse(documentId).success) return null;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  return data?.signedUrl ?? null;
}

/**
 * Deletes an import and the files it brought in, unless a file has since been
 * attached to a purchase, item or service event.
 */
export async function deleteImport(importId: string): Promise<{ ok: boolean }> {
  if (!id.safeParse(importId).success) return { ok: false };
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("import_id", importId);
  const docIds = (docs ?? []).map((d) => d.id);

  if (docIds.length > 0) {
    const { data: links } = await supabase
      .from("document_links")
      .select("document_id")
      .in("document_id", docIds);
    const linked = new Set((links ?? []).map((l) => l.document_id));
    const unlinked = (docs ?? []).filter((d) => !linked.has(d.id));

    if (unlinked.length > 0) {
      await supabase.storage.from("documents").remove(unlinked.map((d) => d.storage_path));
      await supabase.from("documents").delete().in("id", unlinked.map((d) => d.id));
    }
  }

  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) console.error("[imports] delete failed:", error.message);
  return { ok: !error };
}

// ── Reading uploaded documents ──────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ImportStatus = Database["public"]["Enums"]["import_status"];
type ImportStage = Database["public"]["Enums"]["import_stage"];

interface Outcome {
  status: Extract<ImportStatus, "needs_review" | "failed" | "unsupported">;
  stage: ImportStage;
  document_kind?: Database["public"]["Enums"]["document_kind"];
  parser?: string;
  extracted?: Json;
  review_reasons?: string[];
  candidates?: Json;
  error?: { code: string; message: string; stage: ImportStage; retryable: boolean };
}

export type ProcessResult = { ok: true; status: ImportStatus } | { ok: false; message: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const failure = (code: string, message: string, retryable: boolean, stage: ImportStage = "text_extracted"): Outcome => ({
  status: "failed",
  stage: "received",
  error: { code, message, stage, retryable },
});

/**
 * Reads an uploaded document: extracts the text, parses it, checks it and
 * matches it to items, then leaves it ready for review (spec §4C, §4E).
 */
export async function processImport(importId: string): Promise<ProcessResult> {
  if (!id.safeParse(importId).success) return { ok: false, message: "Unknown import." };
  const supabase = await createClient();

  const { data: started, error } = await supabase.rpc("start_import_processing", { import_id: importId });
  if (error || !started) {
    return { ok: false, message: "This import is already being read, or has been saved." };
  }

  let outcome: Outcome;
  try {
    outcome = await readDocument(supabase, importId);
  } catch (e) {
    console.error("[imports] reading failed:", e);
    outcome = failure("EXTRACTION_ERROR", "Something went wrong while reading this file. Try again.", true);
  }

  const { error: recordError } = await supabase.rpc("record_import_result", {
    import_id: importId,
    outcome: outcome as unknown as Json,
  });
  if (recordError) {
    console.error("[imports] recording result failed:", recordError.message);
    return { ok: false, message: "Couldn't save what was read. Try again." };
  }
  return { ok: true, status: outcome.status };
}

/** Re-queues a failed import that can be retried, then reads it again. */
export async function retryImport(importId: string): Promise<ProcessResult> {
  if (!id.safeParse(importId).success) return { ok: false, message: "Unknown import." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_import", { import_id: importId });
  if (error) return { ok: false, message: "This import can't be retried." };
  return processImport(importId);
}

async function readDocument(supabase: Supabase, importId: string): Promise<Outcome> {
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, mime_type, size_bytes")
    .eq("import_id", importId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!doc) return failure("NO_FILE", "The uploaded file is missing. Upload it again.", false);

  if (doc.mime_type !== "application/pdf") {
    return failure(
      "OCR_NOT_AVAILABLE",
      "Photos can't be read automatically yet. Enter the details yourself; the photo stays attached.",
      false,
    );
  }
  if (doc.size_bytes > MAX_PDF_BYTES) return failure("TOO_LARGE", "This PDF is too large to read.", false);

  const { data: blob, error } = await supabase.storage.from("documents").download(doc.storage_path);
  if (error || !blob) throw new Error(`download failed: ${error?.message}`);

  let lines: string[];
  try {
    lines = (await extractPdfText(new Uint8Array(await blob.arrayBuffer()))).lines;
  } catch {
    return failure(
      "PDF_UNREADABLE",
      "This PDF couldn't be opened. It may be damaged or password-protected. Enter the details yourself.",
      false,
    );
  }

  const parsed = parseDocument(lines);
  if (!parsed.ok) {
    if (parsed.reason === "no_text") {
      return failure(
        "NO_TEXT_LAYER",
        "This PDF is a scan with no text in it, which can't be read automatically yet. Enter the details yourself.",
        false,
      );
    }
    return { status: "unsupported", stage: "parsed", document_kind: "other" };
  }

  const x = parsed.extraction;
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
    candidates = (await serviceCandidates(supabase, lines.join("\n"), x.fields.provider?.value ?? undefined)).map(
      (c) => ({ item_id: c.itemId, score: c.score, evidence: c.evidence }),
    );
    if ((candidates as unknown[]).length === 0) reviewReasons.push("Couldn't tell which item was serviced. Choose it below.");
  } else if (x.fields.orderRef?.value) {
    const { data: existing } = await supabase
      .from("orders")
      .select("merchant, order_date")
      .eq("order_ref", x.fields.orderRef.value)
      .limit(1)
      .maybeSingle();
    if (existing) {
      reviewReasons.unshift(
        `You already have a purchase with order reference ${x.fields.orderRef.value} from ${existing.merchant}. This may be a duplicate.`,
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

async function serviceCandidates(supabase: Supabase, text: string, provider?: string) {
  const [{ data: items }, { data: events }] = await Promise.all([
    supabase.from("items").select("id, name, brand, model, identifiers").eq("status", "owned"),
    supabase.from("service_events").select("item_id, provider"),
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
