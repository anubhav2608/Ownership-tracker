import { strToU8, zipSync, type Zippable } from "fflate";
import { createClient } from "@/lib/supabase/server";

// Settings → Export all data: a ZIP of the signed-in user's records (one JSON
// file per table) and every document they stored. Runs as the user, so row
// level security limits it to their own rows and files.

export const maxDuration = 60;

const TABLES = [
  "profiles",
  "orders",
  "items",
  "warranties",
  "service_events",
  "service_event_parts",
  "documents",
  "document_links",
  "imports",
  "verified_senders",
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const files: Zippable = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`[export] reading ${table} failed:`, error.message);
      return Response.json({ error: "Couldn't read your data. Please try again." }, { status: 500 });
    }
    // The Gmail key's hash is a credential, not data the user needs back.
    const rows = table === "profiles" ? data.map((r) => ({ ...r, inbound_key_hash: undefined })) : data;
    files[`data/${table}.json`] = strToU8(JSON.stringify(rows, null, 2));
  }

  const { data: docs } = await supabase.from("documents").select("storage_path, file_name, created_at");
  const used = new Set<string>();
  for (const doc of docs ?? []) {
    const { data: blob } = await supabase.storage.from("documents").download(doc.storage_path);
    if (!blob) continue;
    // Readable, unique names: "2026-10-03 invoice.pdf", "2026-10-03 invoice (2).pdf".
    const base = `${doc.created_at.slice(0, 10)} ${doc.file_name.replace(/[\\/:*?"<>|]+/g, " ")}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = base.replace(/(\.[^.]*)?$/, ` (${n})$1`);
    used.add(name);
    files[`documents/${name}`] = new Uint8Array(await blob.arrayBuffer());
  }
  files["README.txt"] = strToU8(
    "Your Ownership Tracker data.\n\ndata/: your records, one JSON file per table.\ndocuments/: the invoices, receipts and emails you stored.\n",
  );

  const zip = zipSync(files, { level: 6 });
  const today = new Date().toISOString().slice(0, 10);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="ownership-export-${today}.zip"`,
      "cache-control": "no-store",
    },
  });
}
