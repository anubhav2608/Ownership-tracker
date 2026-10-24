// Public Supabase settings. Referenced literally so Next.js can inline them in
// client bundles. The publishable key is safe to expose: row level security
// decides what each signed-in user can read and write.
const url = projectOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

// Keep only the origin, so a copied REST URL like https://ref.supabase.co/rest/v1/
// still works: the client adds /auth/v1, /rest/v1 and /storage/v1 itself.
function projectOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/** False until the env vars are set; the app then runs as a demo on sample data. */
export const isSupabaseConfigured = Boolean(url && key);

export function supabaseEnv() {
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return { url, key };
}
