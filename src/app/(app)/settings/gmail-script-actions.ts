"use server";

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// The personal key the Gmail script sends emails with. It's shown once, when
// created; the database keeps only its SHA-256 hash and the last characters.

export async function createGmailKey(): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  const key = `ik_${randomBytes(24).toString("hex")}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inbound_key", {
    key_hash: createHash("sha256").update(key).digest("hex"),
    hint: `…${key.slice(-4)}`,
  });
  if (error) {
    console.error("[settings] creating Gmail key failed:", error.code, error.message);
    return {
      ok: false,
      message:
        error.code === "PGRST202"
          ? "Your database needs the latest update: run `npx supabase db push`, then try again."
          : "Couldn't create a key. Please try again.",
    };
  }
  return { ok: true, key };
}

export async function revokeGmailKey(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_inbound_key", { key_hash: null, hint: null });
  if (error) console.error("[settings] revoking Gmail key failed:", error.message);
  return { ok: !error };
}
