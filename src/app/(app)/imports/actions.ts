"use server";

import { z } from "zod";
import { failure, readImport, type Outcome } from "@/lib/extraction/read-import";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

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

// ── Reading uploads and forwarded emails ────────────────────────────────

export type ProcessResult = { ok: true; status: ImportStatus } | { ok: false; message: string };
type ImportStatus = Database["public"]["Enums"]["import_status"];

/** PostgREST reports a function the database doesn't have as PGRST202 (or 42883). */
const missingFunction = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883";
const NOT_MIGRATED =
  "Reading isn't set up on your database yet. Run `npx supabase db push` to apply the latest migration, then try again.";

/**
 * Reads an import's documents: extracts the text, parses it, checks it and
 * matches it to items, then leaves it ready for review (spec §4C, §4E).
 */
export async function processImport(importId: string): Promise<ProcessResult> {
  if (!id.safeParse(importId).success) return { ok: false, message: "Unknown import." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return { ok: false, message: "Please sign in again." };

  const { data: started, error } = await supabase.rpc("start_import_processing", { import_id: importId });
  if (error) {
    console.error("[imports] start_import_processing failed:", error.code, error.message);
    return { ok: false, message: missingFunction(error) ? NOT_MIGRATED : "Couldn't start reading. Try again." };
  }
  if (!started) return { ok: false, message: "This import is already being read, or has been saved." };

  let outcome: Outcome;
  try {
    outcome = await readImport(supabase, userId, importId);
  } catch (e) {
    console.error("[imports] reading failed:", e);
    outcome = failure("EXTRACTION_ERROR", "Something went wrong while reading this file. Try again.", true);
  }

  const { error: recordError } = await supabase.rpc("record_import_result", {
    import_id: importId,
    outcome: outcome as unknown as Json,
  });
  if (recordError) {
    console.error("[imports] recording result failed:", recordError.code, recordError.message);
    return { ok: false, message: missingFunction(recordError) ? NOT_MIGRATED : "Couldn't save what was read. Try again." };
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

/**
 * Trusts the sender of an email that was held because the address isn't
 * verified, then reads it. Other emails held for that sender are queued too.
 */
export async function approveSender(importId: string): Promise<ProcessResult> {
  if (!id.safeParse(importId).success) return { ok: false, message: "Unknown import." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_import_sender", { import_id: importId });
  if (error) {
    console.error("[imports] approve_import_sender failed:", error.code, error.message);
    return {
      ok: false,
      message: missingFunction(error) ? NOT_MIGRATED : "Couldn't verify this sender. Please try again.",
    };
  }
  return processImport(importId);
}
