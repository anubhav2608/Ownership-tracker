"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
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
    // Logged to the terminal running the app, to diagnose setup problems.
    console.error("[login] signInWithOtp failed:", error.status, error.code, error.message);
    redirect(`/login?mode=${mode}&error=${emailErrorReason(error)}`);
  }
  redirect(`/login?mode=${mode}&sent=${encodeURIComponent(email)}`);
}

/** Maps a Supabase auth error to a key of the messages on the login page. */
function emailErrorReason(error: AuthError) {
  if (isAuthRetryableFetchError(error)) return "unreachable";
  switch (error.code) {
    case "email_address_not_authorized":
      return "not_authorized";
    case "email_address_invalid":
      return "email";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate";
    case "signup_disabled":
    case "email_provider_disabled":
    case "otp_disabled":
      return "disabled";
  }
  if (error.status === 429) return "rate";
  if (error.status === 401 || /api key/i.test(error.message)) return "key";
  return "send";
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
