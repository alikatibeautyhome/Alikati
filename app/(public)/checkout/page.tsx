import type { Metadata } from 'next';
import { getSalonSettings } from '@/lib/api';
import { CheckoutForm } from '@/components/shop/CheckoutForm';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Confirm your delivery details and place your Alikati Beauty Home order.',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const settings = await getSalonSettings();

  return (
    <section className="section">
      <div className="container">
        <header className="space-y-2">
          <p className="eyebrow">Checkout</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
            Confirm your delivery details
          </h1>
          <p className="max-w-2xl text-charcoal-soft">
            Delivery across Kailali and beyond. Pay by cash on delivery, bank transfer, eSewa or
            Khalti — we will confirm your order on WhatsApp.
          </p>
        </header>

        <div className="mt-8">
          <CheckoutForm settings={settings} />
        </div>
      </div>
    </section>
  );
}
