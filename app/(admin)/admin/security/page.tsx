'use client';

import { MfaSettingsCard } from '@/components/admin/MfaSettingsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Account security for the signed-in staff member.
 *
 * Deliberately about **their own** account rather than a settings panel full of switches: the
 * highest-value thing a staff member can do for the shop's security is protect their own login,
 * and the console is where they are already signed in to do it.
 *
 * The "what already protects this app" list below is not decoration. It tells whoever reads this
 * page what is handled for them — so nobody re-invents a weaker version, and so an owner can see
 * at a glance that the basics are in place.
 */
const PROTECTIONS = [
  ['Password sign-in', 'Every console screen requires an authenticated staff account.'],
  ['Role-based access', 'Admin and staff roles; the database enforces this too, not just the UI.'],
  ['Customer data locked down', 'Row-level security means a signed-in non-staff account cannot read enquiries, products or orders.'],
  ['Rate-limited sign-in and APIs', 'Repeated attempts are throttled per caller.'],
  ['Encrypted in transit', 'HTTPS everywhere, with HSTS and a strict Content-Security-Policy.'],
];

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Account</p>
        <h1 className="mt-1 font-display text-3xl text-charcoal">Security</h1>
        <p className="mt-1 max-w-2xl text-sm text-charcoal-soft">
          Protect your own sign-in. This console can see customer names, phone numbers and delivery
          addresses, so your account is worth more to an attacker than an average login.
        </p>
      </div>

      <MfaSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle>What already protects this console</CardTitle>
          <CardDescription>
            Handled for you — nothing on this list needs setting up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            {PROTECTIONS.map(([term, detail]) => (
              <div key={term} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="text-sm font-medium text-charcoal">{term}</dt>
                <dd className="text-sm text-charcoal-soft">{detail}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
