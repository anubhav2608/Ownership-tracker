"use server";

import { z } from "zod";
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
