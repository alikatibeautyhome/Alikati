import type { Metadata } from 'next';
import { getActiveServices, getFeaturedServices, getSalonSettings } from '@/lib/api';
import { ServiceCatalog } from '@/components/public/ServiceCatalog';
import { CATEGORY_ORDER } from '@/lib/utils';
import type { ServiceCategory } from '@/types/database.types';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Services & Price List in NPR',
  description:
    'Hair, bridal, nail, skin and package services at Alikati Beauty Home, Attariya Chowk. Transparent NPR prices, durations and live slot availability — book online.',
};

/** Whitelist the `?category=` query value so only real categories are applied. */
function parseCategory(value: string | string[] | undefined): ServiceCategory | undefined {
  if (typeof value !== 'string') return undefined;
  return (CATEGORY_ORDER as string[]).includes(value) ? (value as ServiceCategory) : undefined;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [services, settings, featured, params] = await Promise.all([
    getActiveServices(),
    getSalonSettings(),
    getFeaturedServices(8),
    searchParams,
  ]);

  const initialCategory = parseCategory(params.category);

  return (
    <section className="section">
      <div className="container">
        <header className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="eyebrow">Price list</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
            Services &amp; prices in NPR
          </h1>
          <p className="text-charcoal-soft">
            नमस्ते! Pick a service, choose a time that suits you and confirm on WhatsApp. Prices include
            GST-free salon rates as listed — no hidden charges.
          </p>
        </header>

        <div className="mt-10">
          <ServiceCatalog
            services={services}
            settings={settings}
            featured={featured}
            initialCategory={initialCategory}
          />
        </div>
      </div>
    </section>
  );
}
