import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Storing files that arrive inside emails (forwarded, or uploaded as .eml) as
// documents of an import. Works with the user's client or the service role;
// queries name the user either way.

type Db = SupabaseClient<Database>;

export interface Attachment {
  fileName: string;
  mimeType: string;
  content: Uint8Array;
}

/** Kinds of attachment kept as documents; the documents bucket accepts only these. */
const KEPT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "message/rfc822": "eml",
};
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

export const isKeptType = (mimeType: string) => KEPT_TYPES.has(mimeType);
export const extensionFor = (mimeType: string) => EXTENSIONS[mimeType] ?? "bin";

/** The attachments worth keeping: PDFs and photos within the size limit. */
export const keptAttachments = <T extends Attachment>(list: T[]) =>
  list.filter((a) => isKeptType(a.mimeType) && a.content.byteLength <= MAX_ATTACHMENT_BYTES).slice(0, MAX_ATTACHMENTS);

/** Uploads a file to the user's folder and records it as a document of the import. */
export async function storeDocument(
  db: Db,
  userId: string,
  importId: string,
  a: Attachment,
  source: "email" | "upload" = "email",
) {
  const path = `${userId}/${randomUUID()}.${extensionFor(a.mimeType)}`;
  const { error: uploadError } = await db.storage
    .from("documents")
    .upload(path, a.content, { contentType: a.mimeType });
  if (uploadError) throw new Error(`storing ${a.fileName} failed: ${uploadError.message}`);

  const row = {
    user_id: userId,
    kind: "other" as const,
    file_name: a.fileName.slice(0, 255),
    storage_path: path,
    mime_type: a.mimeType,
    size_bytes: a.content.byteLength,
    sha256: sha256(a.content),
    source,
    import_id: importId,
  };
  let { error } = await db.from("documents").insert(row);
  // The same file is already stored (e.g. a logo PDF every email carries): keep this copy without a hash.
  if (error?.code === "23505") ({ error } = await db.from("documents").insert({ ...row, sha256: null }));
  if (error) {
    await db.storage.from("documents").remove([path]);
    throw new Error(`recording ${a.fileName} failed: ${error.message}`);
  }
  return { storage_path: path, mime_type: a.mimeType, size_bytes: a.content.byteLength, file_name: row.file_name };
}
