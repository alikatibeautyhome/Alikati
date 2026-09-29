import type { Metadata } from 'next';
import { getSalonSettings } from '@/lib/api';
import { Well10Showcase } from '@/components/shop/Well10Showcase';
import {
  WELL10_CATEGORY_NAME,
  WELL10_PRODUCTS,
  WELL10_SOURCE_URL,
  WELL10_TOTALS,
  formatWell10Price,
} from '@/lib/well10-catalog';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Well10 Cosmetics — Professional Salon Hair Care',
  description:
    `Well 10 Professional hair care at Alikati Beauty Home, Attariya Chowk: salon treatments, ` +
    `keratin smoothing, toning shampoos and finishing serums. ${WELL10_TOTALS.lines} lines in ` +
    `stock from ${formatWell10Price(Math.min(...WELL10_PRODUCTS.map((p) => p.priceNpr)))}.`,
  openGraph: {
    title: 'Well10 Cosmetics — Professional Salon Hair Care',
    description:
      'Well 10 Professional salon treatments, keratin smoothing systems, toning shampoos and hair serums, stocked at Alikati Beauty Home.',
    type: 'website',
  },
};

/**
 * Public showcase for the Well 10 Professional range.
 *
 * The business WhatsApp number is read server-side from `salon_settings` and handed to the client
 * component, so the enquiry buttons use the shop's live number rather than a hard-coded one.
 *
 * Structured data lists only name, brand, image, description and price. Availability and ratings
 * are deliberately absent: `packQty` is how many pieces come in a pack, not a stock level, and the
 * range has no reviews — publishing either would be inventing data.
 */
export default async function Well10Page() {
  const settings = await getSalonSettings();

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Well10 Cosmetics — Well 10 Professional Salon Hair Care',
    url: WELL10_SOURCE_URL,
    numberOfItems: WELL10_PRODUCTS.length,
    itemListElement: WELL10_PRODUCTS.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.title,
        description: product.description,
        // The shop's category, not this page's Treatments/Shampoos/Serums taxonomy: structured
        // data should name the category the product actually carries in the catalogue.
        category: WELL10_CATEGORY_NAME,
        ...(product.imageUrl ? { image: product.imageUrl } : {}),
        brand: { '@type': 'Brand', name: 'Well 10 Professional' },
        offers: {
          '@type': 'Offer',
          price: product.priceNpr,
          priceCurrency: 'NPR',
          seller: { '@type': 'Organization', name: 'Alikati Beauty Home' },
        },
      },
    })),
  };

  return (
    <>
      <Well10Showcase whatsappNumber={settings.whatsapp_number} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
    </>
  );
}
