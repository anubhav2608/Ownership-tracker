import { NextResponse, type NextRequest } from "next/server";
import { createClient, safeNextPath } from "@/lib/supabase/server";

// OAuth (Google) redirect target: exchange the one-time code for a session.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    // The same link opened twice (a retry, a double click): the first one signed in, and
    // the code can't be used again. Already signed in is a success, not an error.
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) return NextResponse.redirect(new URL(next, request.url));
    // Logged to the terminal or Vercel logs, to diagnose sign-in problems.
    console.error("[auth/callback] Google sign-in failed:", error.code ?? error.status, error.message);
  }

  return NextResponse.redirect(new URL("/login?error=oauth", request.url));
}
