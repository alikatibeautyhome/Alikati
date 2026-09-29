import type { Metadata } from 'next';
import { getSalonSettings } from '@/lib/api';
import { getOrderLineMedia } from '@/lib/order-media';
import { OrderConfirmation } from '@/components/shop/OrderConfirmation';

export const metadata: Metadata = {
  title: 'Order confirmation',
  description: 'Your Alikati Beauty Home order confirmation and delivery status.',
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [settings, media] = await Promise.all([
    getSalonSettings(),
    getOrderLineMedia(reference),
  ]);

  return (
    <section className="section">
      <div className="container">
        <OrderConfirmation
          reference={reference}
          nepaliDates={settings.nepali_dates}
          media={media}
        />
      </div>
    </section>
  );
}
