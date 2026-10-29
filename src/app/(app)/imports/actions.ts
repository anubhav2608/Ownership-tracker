"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { readImport, readingCrashed, type Outcome } from "@/lib/extraction/read-import";
import type { Database, Json } from "@/lib/supabase/database.types";
import { deleteOrder, deleteServiceEvent } from "@/lib/record-actions";
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
 * attached to a purchase, item or service event. With `alsoSaved`, the purchase
 * or service saved from it goes too (and with it the files only it used), so
 * reading a document again doesn't leave the old record behind.
 */
export async function deleteImport(importId: string, alsoSaved = false): Promise<{ ok: boolean }> {
  if (!id.safeParse(importId).success) return { ok: false };
  const supabase = await createClient();

  if (alsoSaved) {
    const { data: imp } = await supabase.from("imports").select("result").eq("id", importId).maybeSingle();
    const result = (imp?.result ?? {}) as { order_id?: string; service_event_id?: string };
    // Each of these deletes the import as well, once its record is gone.
    const removed = result.service_event_id
      ? await deleteServiceEvent(result.service_event_id)
      : result.order_id
        ? await deleteOrder(result.order_id)
        : ({ ok: true } as const);
    // Already deleted from its own page: nothing more to remove there.
    if (!removed.ok && !/no longer exists/.test(removed.message)) return { ok: false };
  }

  await removeImportFiles(supabase, [importId]);
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) console.error("[imports] delete failed:", error.message);
  // The "needs you" count in the menu changes too.
  refresh();
  return { ok: !error };
}

/** Removes the files these imports brought in, except ones since attached to a record. */
async function removeImportFiles(supabase: Awaited<ReturnType<typeof createClient>>, importIds: string[]) {
  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path")
    .in("import_id", importIds);
  const docIds = (docs ?? []).map((d) => d.id);
  if (docIds.length === 0) return;

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
    outcome = readingCrashed(e, "file");
  }

  const { error: recordError } = await supabase.rpc("record_import_result", {
    import_id: importId,
    outcome: outcome as unknown as Json,
  });
  if (recordError) {
    console.error("[imports] recording result failed:", recordError.code, recordError.message);
    return { ok: false, message: missingFunction(recordError) ? NOT_MIGRATED : "Couldn't save what was read. Try again." };
  }
  refresh();
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

/**
 * Gmail's "confirm forwarding" email, dealt with in Settings: trusts the Gmail
 * address that asked (so what it forwards is read), then removes the email.
 */
export async function finishForwarding(importId: string, trust: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!id.safeParse(importId).success) return { ok: false, message: "Unknown import." };
  if (trust) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("approve_import_sender", { import_id: importId });
    if (error) {
      console.error("[imports] approve_import_sender failed:", error.code, error.message);
      return { ok: false, message: "Couldn't trust this address. Please try again." };
    }
  }
  return deleteImport(importId);
}

/**
 * Deletes several imports at once (see deleteImport), in a few batched queries
 * rather than one round of them per import. Returns the ones it couldn't delete.
 */
export async function deleteImports(importIds: string[], alsoSaved = false): Promise<{ failed: string[] }> {
  const ids = z.array(id).max(200).safeParse(importIds);
  if (!ids.success) return { failed: importIds };
  const supabase = await createClient();
  const failed = new Set<string>();

  if (alsoSaved) {
    const { data: imps } = await supabase.from("imports").select("id, result").in("id", ids.data);
    const saved = (imps ?? []).map((imp) => ({
      importId: imp.id,
      ...((imp.result ?? {}) as { order_id?: string; service_event_id?: string }),
    }));
    // A few at a time: each one checks and removes its own documents.
    for (let i = 0; i < saved.length; i += 5) {
      await Promise.all(
        saved.slice(i, i + 5).map(async (r) => {
          const removed = r.service_event_id
            ? await deleteServiceEvent(r.service_event_id)
            : r.order_id
              ? await deleteOrder(r.order_id)
              : ({ ok: true } as const);
          if (!removed.ok && !/no longer exists/.test(removed.message)) failed.add(r.importId);
        }),
      );
    }
  }

  const rest = ids.data.filter((i) => !failed.has(i));
  if (rest.length > 0) {
    await removeImportFiles(supabase, rest);
    const { error } = await supabase.from("imports").delete().in("id", rest);
    if (error) {
      console.error("[imports] bulk delete failed:", error.message);
      rest.forEach((i) => failed.add(i));
    }
  }
  refresh();
  return { failed: [...failed] };
}

const refundSchema = z.object({
  orderId: id,
  itemIds: z.array(id).max(200),
  outcome: z.enum(["returned", "cancelled"]),
  refund: z.number().nonnegative().max(1e10),
  /** From the email: the date in it, or when it was sent. */
  happenedOn: z.iso.date().optional(),
});

/**
 * Applies a refund notice the user has checked: the items that went back are
 * marked returned (or cancelled), the money back is added to the purchase, and
 * the notice is filed with it.
 */
export async function applyRefund(
  importId: string,
  input: z.infer<typeof refundSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = refundSchema.safeParse(input);
  if (!id.safeParse(importId).success || !parsed.success) return { ok: false, message: "Please check the details and try again." };
  const { orderId, itemIds, outcome, refund, happenedOn } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_refund_import", {
    import_id: importId,
    order_id: orderId,
    item_ids: itemIds,
    outcome,
    refund,
    happened_on: happenedOn,
  });
  if (error) {
    console.error("[imports] apply_refund_import failed:", error.code, error.message);
    if (missingFunction(error)) return { ok: false, message: NOT_MIGRATED };
    return {
      ok: false,
      message: error.code === "P0002" ? "That purchase or import no longer exists, or the refund was already applied." : "Couldn't apply the refund. Please try again.",
    };
  }
  refresh();
  return { ok: true };
}
