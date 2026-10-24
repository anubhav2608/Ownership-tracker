"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;

const uploadSchema = z.object({
  path: z.string().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  size: z.number().int().nonnegative().max(MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type RegisterUploadResult =
  | { ok: true; importId: string }
  | { ok: false; reason: "duplicate"; importId?: string }
  | { ok: false; reason: "invalid" | "failed"; message: string };

/**
 * Records a file the browser already uploaded to the private "documents" bucket
 * as a document and a queued import. A file uploaded before (same SHA-256) is
 * reported as a duplicate and the new copy is removed.
 */
export async function registerUpload(input: z.input<typeof uploadSchema>): Promise<RegisterUploadResult> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "That file can't be imported." };
  const { path, fileName, mimeType, size, sha256 } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId || !path.startsWith(`${userId}/`)) {
    return { ok: false, reason: "invalid", message: "Please sign in again." };
  }

  const removeUpload = () => supabase.storage.from("documents").remove([path]);

  const { data: existing } = await supabase
    .from("documents")
    .select("import_id")
    .eq("sha256", sha256)
    .maybeSingle();
  if (existing) {
    await removeUpload();
    return { ok: false, reason: "duplicate", importId: existing.import_id ?? undefined };
  }

  const { data: imp, error: importError } = await supabase
    .from("imports")
    .insert({ source: "upload", title: fileName, content_sha256: sha256 })
    .select("id")
    .single();
  if (importError || !imp) {
    await removeUpload();
    if (importError?.code === "23505") return { ok: false, reason: "duplicate" };
    console.error("[upload] creating import failed:", importError?.message);
    return { ok: false, reason: "failed", message: "Couldn't save the upload. Please try again." };
  }

  const { error: documentError } = await supabase.from("documents").insert({
    kind: "other",
    file_name: fileName,
    storage_path: path,
    mime_type: mimeType,
    size_bytes: size,
    sha256,
    source: "upload",
    import_id: imp.id,
  });
  if (documentError) {
    await Promise.all([removeUpload(), supabase.from("imports").delete().eq("id", imp.id)]);
    console.error("[upload] creating document failed:", documentError.message);
    return { ok: false, reason: "failed", message: "Couldn't save the upload. Please try again." };
  }

  return { ok: true, importId: imp.id };
}
