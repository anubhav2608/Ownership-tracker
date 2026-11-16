"use server";

import { redirect } from "next/navigation";
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
