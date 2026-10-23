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
  }

  return NextResponse.redirect(new URL("/login?error=oauth", request.url));
}
