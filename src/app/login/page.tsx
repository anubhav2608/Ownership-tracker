import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { mode } = await props.searchParams;
  const signup = mode === "signup";

  // Prototype only: buttons navigate. Supabase Auth replaces this.
  const next = signup ? "/onboarding" : "/dashboard";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            O
          </span>
          Ownership
        </Link>
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-xl font-semibold">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {signup
              ? "Start tracking what you own in a couple of minutes."
              : "Log in to see your items and inbox."}
          </p>

          <Button asChild variant="outline" className="mt-6 w-full">
            <Link href={next}>
              <GoogleIcon /> Continue with Google
            </Link>
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <Button asChild className="w-full">
              <Link href={next}>{signup ? "Send magic link" : "Email me a login link"}</Link>
            </Button>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account? " : "New here? "}
          <Link
            href={signup ? "/login" : "/login?mode=signup"}
            className="font-medium text-primary"
          >
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
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
