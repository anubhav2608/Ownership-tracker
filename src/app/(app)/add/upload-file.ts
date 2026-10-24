import { createClient } from "@/lib/supabase/client";
import { registerUpload, type RegisterUploadResult } from "./actions";

// Browsers often leave File.type empty for HEIC; the bucket only accepts listed types.
const typesByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads straight to the user's folder in private storage, then records the import. */
export async function uploadFile(userId: string, file: File): Promise<RegisterUploadResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = typesByExtension[extension] ?? file.type;
  if (!Object.values(typesByExtension).includes(mimeType)) {
    return { ok: false, reason: "invalid", message: `${file.name}: only PDF, JPG, PNG, WebP or HEIC files.` };
  }

  const path = `${userId}/${crypto.randomUUID()}.${extension || "bin"}`;
  const [sha256, upload] = await Promise.all([
    sha256Hex(file),
    createClient().storage.from("documents").upload(path, file, { contentType: mimeType }),
  ]);
  if (upload.error) {
    return { ok: false, reason: "failed", message: `${file.name}: ${upload.error.message}` };
  }

  return registerUpload({ path, fileName: file.name, mimeType, size: file.size, sha256 });
}
