"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, safeNextPath } from "@/lib/supabase/server";

async function siteOrigin() {
  // The request's own origin, so preview deployments send users back to themselves.
  // Supabase only honours redirect URLs on its allow list (supabase/config.toml).
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

const emailSchema = z.object({
  email: z.email().max(254),
  next: z.string().optional(),
  mode: z.enum(["login", "signup"]).optional(),
});

export async function signInWithEmail(formData: FormData) {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  const mode = formData.get("mode") === "signup" ? "signup" : "login";
  if (!parsed.success) redirect(`/login?mode=${mode}&error=email`);

  const { email, next } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Used by the email templates as {{ .RedirectTo }}.
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(safeNextPath(next))}`,
    },
  });

  if (error) {
    const reason = error.status === 429 ? "rate" : "send";
    redirect(`/login?mode=${mode}&error=${reason}`);
  }
  redirect(`/login?mode=${mode}&sent=${encodeURIComponent(email)}`);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}
