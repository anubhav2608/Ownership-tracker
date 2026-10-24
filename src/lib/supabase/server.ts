import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user. Create one per request.
 */
export async function createClient() {
  const { url, key } = supabaseEnv();
  // The auth client reads the clock as soon as it starts, so it must only run at request time.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore there.
        }
      },
    },
  });
}

/** Only allow redirects to paths on this site, never to another origin. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
