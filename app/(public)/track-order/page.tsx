import type { Metadata } from 'next';
import { getSalonSettings } from '@/lib/api';
import { TrackOrderForm } from '@/components/shop/TrackOrderForm';

export const metadata: Metadata = {
  title: 'Track Your Order',
  description:
    'Check the status of your Alikati Beauty Home order with your reference and mobile number.',
  robots: { index: false, follow: true },
};

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawReference = params.reference;
  const reference = Array.isArray(rawReference) ? rawReference[0] : rawReference;
  const settings = await getSalonSettings();

  return (
    <section className="section">
      <div className="container">
        <header className="mx-auto max-w-2xl space-y-2 text-center">
          <p className="eyebrow">Order status</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">Track your order</h1>
          <p className="text-charcoal-soft">
            Enter your order reference and the mobile number you used at checkout to see where your
            parcel is.
          </p>
        </header>

        <div className="mt-8">
          <TrackOrderForm
            initialReference={reference ?? ''}
            nepaliDates={settings.nepali_dates}
          />
        </div>
      </div>
    </section>
  );
}
