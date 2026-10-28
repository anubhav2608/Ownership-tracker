"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };

const email = z.email().max(254);

/**
 * Adds an address the user forwards mail from. It starts unconfirmed: the
 * first email that arrives from it at the user's forwarding address confirms
 * it (users can't mark their own senders verified).
 */
export async function addSender(address: string): Promise<Result> {
  const parsed = email.safeParse(address.trim().toLowerCase());
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.from("verified_senders").insert({ email: parsed.data });
  if (error?.code === "23505") return { ok: false, message: "That address is already in your list." };
  if (error) {
    console.error("[settings] adding sender failed:", error.code, error.message);
    return { ok: false, message: "Couldn't add the address. Please try again." };
  }
  refresh();
  return { ok: true };
}

/** Stops reading mail forwarded from this address. */
export async function removeSender(address: string): Promise<Result> {
  const parsed = email.safeParse(address);
  if (!parsed.success) return { ok: false, message: "Unknown address." };
  const supabase = await createClient();
  const { error } = await supabase.from("verified_senders").delete().eq("email", parsed.data);
  if (error) {
    console.error("[settings] removing sender failed:", error.code, error.message);
    return { ok: false, message: "Couldn't remove the address. Please try again." };
  }
  refresh();
  return { ok: true };
}

/** A new forwarding address; the old one stops accepting mail at once. */
export async function regenerateForwardingAddress(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_forwarding_token");
  if (error) {
    console.error("[settings] regenerating the forwarding address failed:", error.code, error.message);
    return { ok: false, message: "Couldn't create a new address. Please try again." };
  }
  refresh();
  return { ok: true };
}

/**
 * Deletes the signed-in user's account: their stored files, then the user,
 * which deletes every row they own (all tables cascade from auth.users).
 * Needs the service role, scoped here to the user who asked.
 */
export async function deleteAccount(): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { ok: false, message: "Please sign in again." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, message: "Account deletion isn't set up on this app (SUPABASE_SECRET_KEY)." };
  }

  // Files first: once the user is gone, nothing points at them any more.
  for (const bucket of ["documents", "inbound-raw"] as const) {
    const paths = await listFiles(admin, bucket, userId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) {
        console.error(`[settings] deleting ${bucket} files failed:`, error.message);
        return { ok: false, message: "Couldn't delete your files. Nothing else was deleted; please try again." };
      }
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[settings] deleting the user failed:", error.message);
    return { ok: false, message: "Your files were deleted, but your account couldn't be. Please try again." };
  }
  await supabase.auth.signOut();
  return { ok: true };
}

/** Every file under the user's folder in a bucket (files are stored as <user id>/…). */
async function listFiles(admin: ReturnType<typeof createAdminClient>, bucket: string, userId: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000, offset });
    if (error || !data?.length) break;
    paths.push(...data.filter((f) => f.id).map((f) => `${userId}/${f.name}`));
    if (data.length < 1000) break;
  }
  return paths;
}
