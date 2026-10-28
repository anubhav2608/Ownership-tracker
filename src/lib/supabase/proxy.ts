import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/items",
  "/purchases",
  "/imports",
  "/add",
  "/settings",
  "/onboarding",
];

const isProtected = (path: string) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Refreshes the auth session cookie on every request and sends signed-out
 * visitors to /login. This is an optimistic check for navigation; row level
 * security is what actually protects the data.
 */
export async function updateSession(request: NextRequest) {
  // A sign-in code that landed anywhere but the callback (Supabase sends it to the Site
  // URL when the callback isn't in its Redirect URLs): finish signing in there.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/auth/")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = "";
    callback.searchParams.set("code", code);
    const next = request.nextUrl.searchParams.get("next");
    const here = request.nextUrl.pathname;
    callback.searchParams.set("next", next ?? (here === "/" || here === "/login" ? "/dashboard" : here));
    return NextResponse.redirect(callback);
  }

  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // No-store headers, so a CDN never serves one user's session to another.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Don't run code between createServerClient and getClaims(): getClaims()
  // validates the JWT and refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    if (path === "/login") target.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(target);
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!signedIn && isProtected(pathname)) return redirectTo("/login");
  if (signedIn && pathname === "/login") return redirectTo("/dashboard");

  return response;
}
