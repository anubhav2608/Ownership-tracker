import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage, OPERATOR } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="11 November 2026">
      <p>
        These terms apply when you use Ownership, run by {OPERATOR}. By creating an account you agree to them and to
        the{" "}
        <Link href="/privacy" className="text-primary hover:underline">
          privacy policy
        </Link>
        .
      </p>
      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be 18 or over, and keep your sign-in to yourself.</li>
          <li>Only send us documents that are yours to share, such as your own orders, invoices and bills.</li>
          <li>Don&rsquo;t use the service to send spam, break the law, or try to reach other people&rsquo;s data.</li>
        </ul>
      </section>
      <section>
        <h2>What was read is for you to check</h2>
        <p>
          The app reads emails and files automatically and can get things wrong: prices, dates, warranties or which
          item a bill belongs to. Check what was read before saving. Don&rsquo;t rely on the app alone for a deadline
          such as a return window or a warranty claim: the shop&rsquo;s own documents decide.
        </p>
      </section>
      <section>
        <h2>The service</h2>
        <ul>
          <li>It&rsquo;s offered as it is, free, without guarantees that it will always be available or error-free.</li>
          <li>We may change or stop features. If we ever close the service, we&rsquo;ll give you time to export your data.</li>
          <li>As far as the law allows, we aren&rsquo;t liable for losses from relying on what the app shows.</li>
        </ul>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time in Settings. We may suspend an account that breaks these terms.
        </p>
      </section>
      <section>
        <h2>Law and contact</h2>
        <p>
          These terms are governed by the laws of India. Questions: <Contact />.
        </p>
      </section>
    </LegalPage>
  );
}
