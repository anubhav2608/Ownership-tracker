import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Service-role client for the inbound-email webhook, which acts for users who
 * aren't signed in. It bypasses row level security, so every query made with
 * it must be scoped to one user explicitly. Never use it for a user's request.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
