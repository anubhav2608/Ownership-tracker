import type { Metadata } from "next";
import { Contact, LegalPage, OPERATOR } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="11 November 2026">
      <p>
        Ownership keeps a record of what you buy, its warranties, returns and repairs. It is run by {OPERATOR}. This
        page says what we keep, why, where, and how to have it deleted.
      </p>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>Your account: your email address, and your name and picture if you sign in with Google.</li>
          <li>
            What you send us: emails you forward to your private address, files you upload (PDFs, photos, saved
            emails), and the purchases, items, warranties, services, returns and refunds made from them.
          </li>
          <li>The addresses you let send to your private address (verified senders).</li>
          <li>
            The changes you make when you check what was read, so we can see how well emails are read and improve
            it.
          </li>
        </ul>
      </section>
      <section>
        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>We never ask for access to your inbox. We only see emails you or your own Gmail filter forward.</li>
          <li>Google sign-in shares only your name, email address and picture with us.</li>
          <li>We don&rsquo;t sell your data, show ads, or use tracking cookies. The only cookie keeps you signed in.</li>
        </ul>
      </section>
      <section>
        <h2>Where it&rsquo;s kept</h2>
        <p>
          Your records and files are stored with Supabase (database and private file storage, where each account can
          only reach its own data). The app runs on Vercel. Forwarded emails and sign-in emails pass through Resend.
          PDFs and photos of receipts are read by Anthropic&rsquo;s Claude AI to pull out their details. These
          providers process data only to run the service for us.
        </p>
      </section>
      <section>
        <h2>How long, and deleting it</h2>
        <ul>
          <li>We keep your data until you delete it. Emails that turn out not to be receipts can be deleted from Imports.</li>
          <li>Settings → Export all data downloads everything as a ZIP.</li>
          <li>Settings → Delete account permanently deletes your account, records and files.</li>
        </ul>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          Under India&rsquo;s Digital Personal Data Protection Act, 2023, you can ask to see, correct or erase your
          data, and raise a grievance. Most of this you can do yourself in the app; for anything else, write to{" "}
          <Contact />.
        </p>
      </section>
      <section>
        <h2>Children</h2>
        <p>Ownership is for people aged 18 or over.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If this policy changes, we&rsquo;ll update this page and its date, and tell you in the app if the change matters.</p>
      </section>
    </LegalPage>
  );
}
