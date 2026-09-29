import type { Metadata } from 'next';
import { getSalonSettings } from '@/lib/api';
import { AccountDashboard } from '@/components/account/AccountDashboard';

export const metadata: Metadata = {
  title: 'My account',
  description: 'Your Alikati Beauty Home orders and saved delivery details.',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const settings = await getSalonSettings();

  return (
    <section className="section">
      <div className="container">
        <AccountDashboard nepaliDates={settings.nepali_dates} />
      </div>
    </section>
  );
}
