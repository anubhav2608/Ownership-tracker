"use server";

import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { processImport } from "@/app/(app)/imports/actions";
import { registerUpload } from "@/app/(app)/add/actions";
import { sampleInvoiceEml } from "@/lib/demo/sample-data";
import { seedDemo } from "@/lib/demo/seed";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// The one-click demo: a private sandbox per visitor (an anonymous account with a
// car owner's sample records), deleted after a few days (see /api/demo/cleanup).
// Needs "Allow anonymous sign-ins" on in Supabase → Authentication → Sign In / Providers.

/** The demo car's page, where the timeline is. */
async function carPage(db: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await db.from("items").select("id").eq("category", "vehicle").limit(1).maybeSingle();
  return data ? `/items/${data.id}` : "/dashboard";
}

export async function startDemo() {
  // Without Supabase the whole app is the demo, on built-in sample data.
  if (!isSupabaseConfigured) redirect("/dashboard");

  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  if (auth?.claims) {
    // A real account stays itself; a demo already running goes back to its car.
    redirect(auth.claims.is_anonymous ? await carPage(db) : "/dashboard");
  }

  const { error } = await db.auth.signInAnonymously();
  if (error) {
    console.error("[demo] anonymous sign-in failed:", error.status, error.code, error.message);
    redirect("/login?error=demo-signin");
  }
  let destination: string;
  try {
    destination = `/items/${await seedDemo(db)}`;
  } catch (e) {
    console.error("[demo] seeding failed:", e);
    redirect("/login?error=demo");
  }
  redirect(destination);
}

export type SampleInvoiceResult = { ok: true; importId: string } | { ok: false; message: string };

/**
 * "Forwards" the demo's service invoice: stores it as the demo user's upload and
 * reads it with the real pipeline, so what they review is what a real email would give.
 */
export async function sendSampleInvoice(): Promise<SampleInvoiceResult> {
  if (!isSupabaseConfigured) return { ok: false, message: "This works once Supabase is set up." };
  const db = await createClient();
  const { data: auth } = await db.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId || !auth.claims.is_anonymous) return { ok: false, message: "The sample invoice is for the demo only." };

  const bytes = Buffer.from(sampleInvoiceEml());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${userId}/${randomUUID()}.eml`;
  const { error } = await db.storage.from("documents").upload(path, bytes, { contentType: "message/rfc822" });
  if (error) return { ok: false, message: "Couldn't store the sample invoice. Please try again." };

  const registered = await registerUpload({
    path,
    fileName: "Service invoice from Example Motors.eml",
    mimeType: "message/rfc822",
    size: bytes.byteLength,
    sha256,
  });
  if (!registered.ok) {
    // Forwarded before: open that one.
    if (registered.reason === "duplicate" && registered.importId) return { ok: true, importId: registered.importId };
    return { ok: false, message: "Couldn't forward the sample invoice. Please try again." };
  }
  await processImport(registered.importId).catch(() => null);
  return { ok: true, importId: registered.importId };
}
