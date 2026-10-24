import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { signInWithEmail, signInWithGoogle } from "./actions";
import { ClearErrorParam } from "./clear-error-param";

export const metadata: Metadata = { title: "Log in" };

const errors: Record<string, string> = {
  email: "Enter a valid email address.",
  send: "We couldn't send the email. Please try again. The terminal running the app shows the exact reason.",
  not_authorized:
    "Supabase's built-in email only sends to members of your Supabase team. Use the email you sign in to Supabase with, or set up a custom SMTP sender.",
  unreachable:
    "Couldn't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in .env.local (it looks like https://abcd.supabase.co) and that the project isn't paused.",
  key: "Supabase rejected the API key. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the app.",
  disabled:
    "Email sign-in is turned off for this project. Enable it under Authentication → Sign In / Providers → Email.",
  rate: "Supabase's built-in email sends only a few sign-in emails per hour. Wait about an hour, or use Continue with Google.",
  link: "That sign-in link has expired or was already used. Request a new one.",
  oauth: "Google sign-in didn't complete. Please try again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            O
          </span>
          Ownership
        </Link>
        <Suspense fallback={<LoginCardSkeleton />}>
          <LoginCard searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function LoginCard({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const signup = one(params.mode) === "signup";
  const sent = one(params.sent);
  const error = errors[one(params.error) ?? ""];
  const next = one(params.next) ?? (signup ? "/onboarding" : "/dashboard");

  return (
    <>
      <div className="rounded-xl border bg-card p-6">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto size-10 text-primary" strokeWidth={1.5} />
            <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a sign-in link to <span className="font-medium text-foreground">{sent}</span>.
              It works once and expires in an hour.
            </p>
            <Button asChild variant="ghost" className="mt-4">
              <Link href={`/login${signup ? "?mode=signup" : ""}`}>Use a different email</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {signup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {signup
                ? "Start tracking what you own in a couple of minutes."
                : "Log in to see your items and imports."}
            </p>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Couldn&rsquo;t sign you in</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                <ClearErrorParam />
              </Alert>
            )}

            {isSupabaseConfigured ? (
              <>
                <form action={signInWithGoogle} className="mt-6">
                  <input type="hidden" name="next" value={next} />
                  <Button type="submit" variant="outline" className="w-full">
                    <GoogleIcon /> Continue with Google
                  </Button>
                </form>
                <Divider />
                <form action={signInWithEmail} className="space-y-4">
                  <input type="hidden" name="next" value={next} />
                  <input type="hidden" name="mode" value={signup ? "signup" : "login"} />
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Email me a sign-in link
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Alert className="mt-6">
                  <AlertTitle>Demo mode</AlertTitle>
                  <AlertDescription>
                    Supabase isn&rsquo;t configured, so this opens the app with sample data.
                  </AlertDescription>
                </Alert>
                <Button asChild className="mt-4 w-full">
                  <Link href={signup ? "/onboarding" : "/dashboard"}>Continue to the demo</Link>
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {!sent && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account? " : "New here? "}
          <Link
            href={signup ? "/login" : "/login?mode=signup"}
            className="font-medium text-primary"
          >
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      )}
    </>
  );
}

function LoginCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6" aria-busy="true">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-6 h-9 w-full" />
      <Skeleton className="my-5 h-px w-full" />
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-2 h-9 w-full" />
      <Skeleton className="mt-4 h-9 w-full" />
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.1Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}
