import type { Metadata } from 'next';
import { MailCheck } from 'lucide-react';
import { getSalonSettings } from '@/lib/api';
import { AccountDashboard } from '@/components/account/AccountDashboard';

export const metadata: Metadata = {
  title: 'My account',
  description: 'Your Alikati Beauty Home orders and saved delivery details.',
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [settings, params] = await Promise.all([getSalonSettings(), searchParams]);

  /*
    `/auth/confirm` sends new arrivals here with `?confirmed=1`.

    Worth saying out loud rather than relying on the dashboard appearing: a visitor who clicked a
    link in an email has no idea which page to expect, and "Namaste, Sunita!" on its own reads like
    they were signed in all along. The banner also tells them what they have just unlocked.
  */
  const justConfirmed = params.confirmed === '1';

  return (
    <section className="section">
      <div className="container">
        {justConfirmed ? (
          <div className="panel mb-6 flex items-start gap-3 p-4" role="status">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-medium text-charcoal">Your email address is confirmed</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Welcome to Alikati Beauty Home. You are signed in and can now place orders, track
                deliveries and book appointments.
              </p>
            </div>
          </div>
        ) : null}

        <AccountDashboard nepaliDates={settings.nepali_dates} />
      </div>
    </section>
  );
}
