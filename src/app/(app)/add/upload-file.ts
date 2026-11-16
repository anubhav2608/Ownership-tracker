import { createClient } from "@/lib/supabase/client";
import { registerUpload, type RegisterUploadResult } from "./actions";

// Browsers often leave File.type empty for HEIC and .eml; the bucket only accepts listed types.
const typesByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  eml: "message/rfc822",
};

/** What the file picker accepts: PDFs, photos and saved emails. */
export const ACCEPTED_FILES = ".pdf,.eml,message/rfc822,image/*";
/** The demo takes PDFs and saved emails only; photos are for the paid version. */
export const DEMO_ACCEPTED_FILES = ".pdf,.eml,message/rfc822";
export const PHOTOS_PAID = "Photos (JPEG, PNG) are available with the paid version of the app only.";

/** Whether a demo visitor may upload this file (a PDF or a saved email). */
export const demoAllows = (fileName: string) => /\.(pdf|eml)$/i.test(fileName);

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StoredFile {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
}

/** Uploads a file straight to the user's folder in private storage. */
export async function storeFile(
  userId: string,
  file: File,
): Promise<{ ok: true; file: StoredFile } | { ok: false; message: string }> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = typesByExtension[extension] ?? file.type;
  if (!Object.values(typesByExtension).includes(mimeType)) {
    return { ok: false, message: `${file.name}: only PDF, JPG, PNG, WebP, HEIC or .eml email files.` };
  }

  const path = `${userId}/${crypto.randomUUID()}.${extension || "bin"}`;
  const [sha256, upload] = await Promise.all([
    sha256Hex(file),
    createClient().storage.from("documents").upload(path, file, { contentType: mimeType }),
  ]);
  if (upload.error) return { ok: false, message: `${file.name}: ${upload.error.message}` };
  return { ok: true, file: { path, fileName: file.name, mimeType, size: file.size, sha256 } };
}

/** Uploads a file, then records it as an import to be read. */
export async function uploadFile(userId: string, file: File): Promise<RegisterUploadResult> {
  const stored = await storeFile(userId, file);
  if (!stored.ok) return { ok: false, reason: "invalid", message: stored.message };
  return registerUpload(stored.file);
}
