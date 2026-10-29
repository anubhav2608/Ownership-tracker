import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// A cheap fingerprint of the signed-in user's imports: how many there are and
// when one last changed. The app polls it and refreshes its data when it
// changes, so an email that arrives (or finishes reading) shows up on its own.

export async function GET() {
  if (!isSupabaseConfigured) return Response.json({ version: "demo" });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const [{ count }, { data: latest }] = await Promise.all([
    supabase.from("imports").select("id", { count: "exact", head: true }),
    supabase.from("imports").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return Response.json(
    { version: `${count ?? 0}:${latest?.updated_at ?? ""}` },
    { headers: { "cache-control": "no-store" } },
  );
}
