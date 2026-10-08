import type { Metadata } from 'next';
import Link from 'next/link';
import { getSalonSettings } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Privacy & cookies',
  description:
    'What Alikati Beauty Home stores when you browse, book or order, and how to change your cookie choice.',
  alternates: { canonical: '/privacy' },
};

export const revalidate = 3600;

/**
 * Plain-language privacy and cookie explanation. Deliberately specific about what is stored,
 * because the shop holds real customer phone numbers and delivery addresses.
 */
export default async function PrivacyPage() {
  const settings = await getSalonSettings();
  const contact = settings.email ?? 'alikatibeautyhome@gmail.com';

  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow">Privacy</p>
      <h1 className="mt-2 font-display text-3xl text-charcoal sm:text-4xl">
        Privacy &amp; cookies
      </h1>
      <p className="mt-3 text-charcoal-soft">
        Last updated {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.
        This page explains what we keep and why, in plain language.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-charcoal-soft sm:text-base">
        <section>
          <h2 className="font-display text-xl text-charcoal">Cookies</h2>
          <p className="mt-2">
            We use the smallest set of cookies that lets the shop work:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-charcoal">Essential.</strong> Remembering your cart, keeping
              you signed in, and remembering that you answered the cookie notice. Without these the
              shop cannot function.
            </li>
            <li>
              <strong className="text-charcoal">Preference.</strong> Remembering whether you chose
              dark or light mode, and which referral link brought you here.
            </li>
            <li>
              <strong className="text-charcoal">Analytics.</strong> Aggregate page counts only, to
              understand which products people look at. Never used to build an advertising profile.
            </li>
          </ul>
          <p className="mt-3">
            If you chose <em>Essential only</em>, the analytics cookie is not set. You can change
            your choice at any time by{' '}
            <Link href="/contact" className="text-rose-gold underline underline-offset-2">
              contacting us
            </Link>{' '}
            or by clearing this site&apos;s data in your browser settings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-charcoal">What we store about an order</h2>
          <p className="mt-2">
            When you book a service or place an order we keep your name, mobile number, delivery
            address and what you ordered. We need this to deliver your parcel, to reach you on
            WhatsApp about it, and to keep a record of the sale. If you create an account we also
            keep your email address and password (hashed — we never see it).
          </p>
          <p className="mt-3">
            We do not sell or rent your details. We do not store card numbers: payment is collected
            by bank transfer, or in cash on delivery. We never handle your card or wallet
            credentials.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-charcoal">Who else sees your data</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Supabase — our database and file hosting provider, which stores the records.</li>
            <li>
              WhatsApp — when you tap a WhatsApp button, the message you send is handled by WhatsApp
              under their own privacy terms.
            </li>
            <li>Our delivery partner, who needs your address to bring the parcel.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-charcoal">Your choices</h2>
          <p className="mt-2">
            Ask us to show, correct or delete the data we hold about you, or to stop sending you
            offers. Write to{' '}
            <a
              href={`mailto:${contact}`}
              className="break-all text-rose-gold underline underline-offset-2"
            >
              {contact}
            </a>
            {settings.phone ? ` or message ${settings.phone} on WhatsApp` : ''}. We will action a
            deletion request within 30 days, except for records we must keep for accounting.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-charcoal">Affiliate programme</h2>
          <p className="mt-2">
            If you join our affiliate programme, referrals are tracked with a code saved in your
            browser for 60 days. We record which orders came through your link so we can pay your
            commission. Your name and phone number are visible to us, not to other affiliates.
          </p>
        </section>
      </div>
    </div>
  );
}
