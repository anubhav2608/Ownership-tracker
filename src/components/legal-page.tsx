import Link from "next/link";
import type { ReactNode } from "react";

/** Who runs the service and how to reach them, set per deployment (see README). */
export const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR_NAME || "the operator of this service";
export const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export function Contact() {
  return CONTACT ? (
    <a href={`mailto:${CONTACT}`} className="text-primary hover:underline">
      {CONTACT}
    </a>
  ) : (
    <>the contact address shown on this page once it is published</>
  );
}

/** A plain, readable page for the privacy policy and terms. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 md:px-8">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Ownership
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
