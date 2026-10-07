import type { Metadata } from 'next';
import Link from 'next/link';
import { getActiveServices, getFeaturedServices, getSalonSettings } from '@/lib/api';
import { ServiceCatalog } from '@/components/public/ServiceCatalog';
import { serializeJsonLd } from '@/lib/security/json-ld';
import { CATEGORY_ORDER, formatPhoneDisplay } from '@/lib/utils';
import type { ServiceCategory } from '@/types/database.types';

/**
 * The questions people actually ask before booking, as FAQPage structured data.
 *
 * Rendered visibly below *and* emitted as JSON-LD, deliberately from the same array. Google requires
 * FAQ markup to correspond to text a visitor can read on the page; markup describing content the
 * page does not show is ignored, and asking for a rich result the page has not earned is a good way
 * to lose trust across the whole domain. Keeping both from one source means they cannot drift.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  // See the note on the home page: `absolute` stops the root layout's title template from
  // appending a second " | Alikati Beauty Home" to a title that already carries the brand.
  title: { absolute: 'Parlour & Salon Services in Attariya | Alikati Beauty Home' },
  description:
    'Explore salon services at Alikati Beauty Home in Attariya, Kailali: precision haircuts, keratin smoothing, hydra facials, bridal packages, and nail extensions.',
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

  // The phone number is interpolated rather than written in, for the same reason the contact page
  // generates its description: it lives in salon_settings and is editable from the console.
  const faqs = [
    {
      question: 'Where is Alikati Beauty Home located?',
      answer:
        'Alikati Beauty Home is on Mahendranagar Road at Attariya Chowk, Kailali, Nepal — open seven days a week.',
    },
    {
      question: 'How do I book a bridal makeup package at Alikati Beauty Home?',
      answer: `Reserve your bridal dates by calling or messaging ${formatPhoneDisplay(
        settings.phone
      )} on WhatsApp, or by visiting the studio at Attariya Chowk.`,
    },
    {
      question: 'Are the skincare and haircare products sold online 100% original?',
      answer:
        'Yes. Every product is sourced from verified suppliers and delivered across Kailali, with a 7-day return window on unopened items.',
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <section className="section">
      <div className="container">
        <header className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="eyebrow">Price list</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
            Professional Salon &amp; Beauty Care Services in Attariya
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

        <div className="mx-auto mt-16 max-w-3xl">
          <header className="space-y-3 text-center">
            <p className="eyebrow">Good to know</p>
            <h2 className="font-display text-2xl text-charcoal sm:text-3xl">
              Questions we are asked before booking
            </h2>
          </header>

          {/* A definition list rather than an accordion: the answer text is always in the DOM, which
              is both what a crawler needs and what someone scanning on a phone wants. */}
          <dl className="mt-8 space-y-3">
            {faqs.map((faq) => (
              <div key={faq.question} className="panel p-5">
                <dt className="font-medium text-charcoal">{faq.question}</dt>
                <dd className="mt-2 text-sm text-charcoal-soft">{faq.answer}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-center text-sm text-charcoal-soft">
            Still unsure which treatment suits you?{" "}
            <Link href="/contact" className="text-rose-gold underline-offset-2 hover:underline">
              Ask us at Attariya Chowk
            </Link>{" "}
            — or browse{" "}
            <Link href="/shop" className="text-rose-gold underline-offset-2 hover:underline">
              recommended post-treatment hair serums
            </Link>
            .
          </p>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }}
      />
    </section>
  );
}
