import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, safeNextPath } from "@/lib/supabase/server";

// Target of the magic-link and signup emails.
// - With the custom templates in supabase/templates, the link carries a token
//   hash, which works in any browser (e.g. email opened on another device).
// - With Supabase's default templates, Supabase verifies the link and sends a
//   PKCE code instead, which works in the browser that requested the link.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  let failure = "link had no token_hash or code (expired links arrive with neither)";
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    failure = `verifyOtp: ${error.code ?? error.status} ${error.message}`;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    failure = `exchangeCodeForSession: ${error.code ?? error.status} ${error.message}`;
  }

  // Logged to the terminal running the app, to diagnose sign-in problems.
  console.error("[auth/confirm] sign-in link failed:", failure);
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
