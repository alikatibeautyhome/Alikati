/**
 * The Well 10 Professional showcase at `/well10`.
 *
 * ── Where the numbers come from ──────────────────────────────────────────────────────────────
 * Prices, sizes, descriptions and stock figures were supplied by the owner and are reproduced
 * **verbatim**. They are not scraped from the supplier and must not be "corrected" against the
 * supplier's own retail prices: the shop's NPR figures differ on purpose (landed cost and margin),
 * and the supplier no longer lists every SKU in this range.
 *
 * Both summary counters are **derived** by `summariseWell10` below, never hard-coded, so a price or
 * stock edit can never leave the headline total stale.
 *
 * ── Relationship to the shop ─────────────────────────────────────────────────────────────────
 * As of the inventory replacement, all nine of these SKUs also exist as rows in `public.products`,
 * filed under the single `Well10` category, so they are buyable on `/shop` and this page hands off
 * to each product page via `shopHref`. This module remains the **brand presentation** — its own
 * copy, taxonomy (Treatments / Shampoos / Serums) and enquiry affordance — so it duplicates the
 * catalogue on purpose. `stockQty` is a copy of `products.stock_qty`; the database is the system of
 * record and this file must be updated alongside any stock change made in the console.
 *
 * ── Image provenance ─────────────────────────────────────────────────────────────────────────
 * Each `imageUrl` is a photograph of the real product, verified by fetching the page that hosts it
 * and looking at the picture — never guessed from a search snippet. Seven come from the brand's own
 * store (`welltencosmetic.com`); the two Brilliance red tubs come from the retailers that list them
 * (Daraz Nepal for the 1000 gm, Flipkart for the 500 gm) because the brand's store does not carry
 * them. `sourceUrl` records the page each photo came from. Requests go through
 * `/api/product-image`, which flattens each shot onto white and stamps the salon's mark. One SKU
 * carries no photo and falls back to a branded tile rather than borrowing an unrelated picture.
 */

import { normalizeWhatsAppNumber } from '@/lib/utils';
import type { Well10Filter, Well10Product, Well10Summary } from '@/types/well10.types';

/** The official store, credited in the section header. */
export const WELL10_SOURCE_URL = 'https://welltencosmetic.com/';
export const WELL10_SOURCE_LABEL = 'welltencosmetic.com';

/** The catalogue category every one of these SKUs is filed under. */
export const WELL10_CATEGORY_NAME = 'Well10';

/** The tag rendered on every card, per the owner's specification. */
export const WELL10_CARD_TAG = 'Hair Care / Salon Treatment';

export const WELL10_CATEGORIES = ['Treatments', 'Shampoos', 'Serums'] as const;

/** Verified product photographs. See the provenance note above. */
const IMG = {
  luxurySpa:
    'https://welltencosmetic.com/image/cache/catalog/whatappimage/WhatsApp%20Image%202025-10-25%20at%201.46.13%20PM%20(2)-500x500.jpeg',
  brilliance1000: 'https://static-01.daraz.com.np/p/5102dc750c494ee1e213615468ae43d0.jpg',
  brilliance500:
    'https://rukminim2.flixcart.com/image/1500/1500/xif0q/hair-treatment/x/g/s/500-keratin-hair-treatment-spa-500g-well10-resized-original-imahduu6u856g65y.jpeg',
  keratinBotox: 'https://welltencosmetic.com/image/cache/catalog/well10/Nov%2028/65-500x500h.jpg',
  botlex: 'https://welltencosmetic.com/image/cache/catalog/well10/Nov%2028/61-500x500h.jpg',
  goldenSerum:
    'https://welltencosmetic.com/image/cache/catalog/whatappimage/WhatsApp%20Image%202025-10-25%20at%201.46.08%20PM%20(1)-500x500.jpeg',
  keratinAloe:
    'https://welltencosmetic.com/image/cache/catalog/2_whatappimage/WhatsApp%20Image%202025-10-25%20at%202.17.25%20PM-500x500w.jpeg',
} as const;

export const WELL10_PRODUCTS: readonly Well10Product[] = [
  {
    slug: 'well-10-hair-treatment-luxury-spa',
    title: 'Well 10 Hair Treatment & Luxury Spa',
    priceNpr: 2500,
    sizeLabel: 'Standard Tub',
    stockQty: 1,
    category: 'Treatments',
    description:
      'Luxurious hair spa therapy designed to deeply nourish, repair, and revitalize dry and damaged hair fibers, restoring silky smoothness and natural shine.',
    imageAlt: 'Well 10 Hair Treatment & Luxury Spa tub packaging',
    shopHref: '/shop/well-10-hair-treatment-luxury-spa',
    sourceUrl: 'https://welltencosmetic.com/index.php?route=product/product&product_id=109',
    imageUrl: IMG.luxurySpa,
  },
  {
    slug: 'well-10-brilliance-red-treatment-1000gm',
    title: 'Well 10 Brilliance Red Treatment (1000 gm)',
    priceNpr: 1500,
    sizeLabel: '1000g Jar',
    stockQty: 6,
    category: 'Treatments',
    description:
      'Professional intensive salon-grade treatment cream that repairs damaged strands, prevents split ends, locks in deep moisture, and provides UV and color defense.',
    imageAlt: 'Well 10 Brilliance Red Treatment 1000g red tub',
    shopHref: '/shop/well-10-brilliance-red-treatment-1000gm',
    sourceUrl:
      'https://www.daraz.com.np/products/well-10-brilliance-keratin-hair-treatment-and-spa-1000ml-i104950733.html',
    imageUrl: IMG.brilliance1000,
  },
  {
    slug: 'well-10-brilliance-red-treatment-500gm',
    title: 'Well 10 Brilliance Red Treatment (500 gm)',
    priceNpr: 800,
    sizeLabel: '500g Jar',
    stockQty: 15,
    category: 'Treatments',
    description:
      'Fast-absorbing deep conditioning treatment formulated to eliminate stubborn frizz, detangle hair, and restore softness and elasticity to treated or stressed hair.',
    imageAlt: 'Well 10 Brilliance Red Treatment 500g red tub',
    shopHref: '/shop/well-10-brilliance-red-treatment-500gm',
    sourceUrl:
      'https://www.flipkart.com/well10-keratin-hair-treatment-spa-500g/p/itm6d26540830ebe',
    imageUrl: IMG.brilliance500,
  },
  {
    slug: 'well-10-intensive-repair-hair-botox',
    title: 'Well 10 Intensive Repair Hair Botox',
    priceNpr: 10500,
    sizeLabel: '730 ml Bottle',
    stockQty: 1,
    category: 'Treatments',
    description:
      'Advanced anti-aging and smoothing botox therapy formulated to rebuild damaged hair cuticle structures, restore tensile strength, eliminate frizz, and provide long-lasting mirror shine.',
    imageAlt: 'Well 10 Intensive Repair Keratin Botox 730 ml bottle',
    shopHref: '/shop/well-10-intensive-repair-hair-botox',
    sourceUrl: 'https://welltencosmetic.com/Well%2010%20Intensive%20Repair%20Keratin%20Botox',
    imageUrl: IMG.keratinBotox,
  },
  {
    slug: 'well-10-keratin-botlex-treatment',
    title: 'Well 10 Keratin Botlex Treatment',
    priceNpr: 11500,
    sizeLabel: '800 ml Professional Salon Pack',
    stockQty: 7,
    category: 'Treatments',
    description:
      'Heavy-duty salon restorative formula combining concentrated keratin proteins and botox elements to rejuvenate chemically damaged, weak, and lifeless hair.',
    imageAlt: 'Well 10 Keratin Botox salon pack tub',
    shopHref: '/shop/well-10-keratin-botlex-treatment',
    sourceUrl:
      'https://welltencosmetic.com/Well%2010%20Professional%20Keratin%20Botox%20Brazilian%20Keratin%20Treatment',
    imageUrl: IMG.botlex,
  },
  {
    slug: 'well-10-golden-hair-serum-50ml',
    title: 'Well 10 Golden Hair Serum (50 ml)',
    priceNpr: 190,
    sizeLabel: '50 ml Bottle',
    stockQty: 16,
    category: 'Serums',
    description:
      'Lightweight, non-sticky hair serum enriched with Moroccan argan oil. Seals cuticles, shields against heat styling, and delivers instant glossy sheen.',
    imageAlt: 'Well 10 Golden Hair Serum 50ml amber dropper bottle',
    shopHref: '/shop/well-10-golden-hair-serum-50ml',
    sourceUrl: 'https://welltencosmetic.com/Well%2010%20Hair%20Serum',
    imageUrl: IMG.goldenSerum,
    // The brand pictures only the 100 ml. This is the genuine Golden Hair Serum shot, so it is used
    // for the smaller size and flagged rather than swapped for a picture of something else.
    imageIsRepresentative: true,
  },
  {
    slug: 'well-10-golden-hair-serum-100ml',
    title: 'Well 10 Golden Hair Serum (100 ml)',
    priceNpr: 390,
    sizeLabel: '100 ml Bottle',
    stockQty: 12,
    category: 'Serums',
    description:
      'Deep-penetrating daily finishing elixir that controls flyaways, nourishes dry tips, and keeps hair smooth and shiny without weighing it down.',
    imageAlt: 'Well 10 Golden Hair Serum 100ml amber pump bottle',
    shopHref: '/shop/well-10-golden-hair-serum-100ml',
    sourceUrl: 'https://welltencosmetic.com/Well%2010%20Hair%20Serum',
    imageUrl: IMG.goldenSerum,
  },
  {
    slug: 'well-10-keratin-protein-shampoo',
    title: 'Well 10 Keratin Protein Shampoo',
    priceNpr: 1500,
    sizeLabel: '500 ml Pump Bottle',
    stockQty: 14,
    category: 'Shampoos',
    description:
      'Gentle daily cleansing shampoo packed with keratin and aloe vera to cleanse the scalp without stripping natural moisture, strengthening strands from root to tip.',
    imageAlt: 'Well 10 Keratin Alovera Shampoo 500 ml mint bottle',
    shopHref: '/shop/well-10-keratin-protein-shampoo',
    sourceUrl: 'https://welltencosmetic.com/Well%2010%20Keratin%20Protein%20Shampoo',
    imageUrl: IMG.keratinAloe,
  },
  {
    slug: 'well-10-no-yellow-purple-shampoo',
    title: 'Well 10 No Yellow Purple Shampoo',
    priceNpr: 1200,
    sizeLabel: 'Standard Pump Bottle',
    stockQty: 4,
    category: 'Shampoos',
    description:
      'Anti-brass color toning shampoo with violet pigments formulated to neutralize brassy, yellow reflections in blonde, gray, bleached, or highlighted hair.',
    imageAlt: 'Well 10 No Yellow Purple Shampoo blonde toner bottle',
    shopHref: '/shop/well-10-no-yellow-purple-shampoo',
    // No photograph exists on any public listing for this SKU — the brand does not stock it. The
    // card falls back to a branded tile; `imageUrl` stays absent rather than borrowing a picture.
  },
];

/** `Rs 2,500` — the price format the owner specified for this section (`en-IN` grouping). */
export function formatWell10Price(amount: number): string {
  return `Rs ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Totals for a set of products.
 *
 * Derived rather than stored: 9 lines, 76 units and Rs 1,48,020 are the current answers for the
 * full range, and they follow the data if a price or stock count changes.
 */
export function summariseWell10(products: readonly Well10Product[]): Well10Summary {
  return products.reduce<Well10Summary>(
    (acc, product) => ({
      lines: acc.lines + 1,
      units: acc.units + product.stockQty,
      valueNpr: acc.valueNpr + product.priceNpr * product.stockQty,
    }),
    { lines: 0, units: 0, valueNpr: 0 }
  );
}

/** Aggregate figures for the whole range — the headline order summary. */
export const WELL10_TOTALS: Well10Summary = summariseWell10(WELL10_PRODUCTS);

/**
 * Case-insensitive search across the fields a customer would actually type, then an optional family
 * filter. An empty query with `'All'` returns everything, so the default view is the complete range.
 */
export function filterWell10Products(
  products: readonly Well10Product[],
  { query = '', category = 'All' }: { query?: string; category?: Well10Filter } = {}
): Well10Product[] {
  const needle = query.trim().toLowerCase();

  return products.filter((product) => {
    if (category !== 'All' && product.category !== category) return false;
    if (!needle) return true;
    return [product.title, product.category, product.sizeLabel, product.description, product.imageAlt]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

/**
 * A WhatsApp enquiry for one SKU.
 *
 * Prices and stock come from this module, so the message can never quote a figure the shop does not
 * charge. Returns `null` when there is no usable business number, which makes the caller hide the
 * button instead of rendering a dead `wa.me` link.
 */
export function createWell10InquiryLink(
  product: Well10Product,
  whatsappNumber: string | null | undefined
): string | null {
  const phone = normalizeWhatsAppNumber(whatsappNumber ?? '');
  if (!phone) return null;

  const rule = '--------------------------------------';
  const text =
    `*✨ Well 10 Product Enquiry — Alikati Beauty Home*\n` +
    `${rule}\n` +
    `• *Product:* ${product.title}\n` +
    `• *Size:* ${product.sizeLabel}\n` +
    `• *Price:* ${formatWell10Price(product.priceNpr)}\n` +
    `• *In stock:* ${product.stockQty} ${product.stockQty === 1 ? 'unit' : 'units'}\n` +
    (product.sourceUrl ? `• *Reference:* ${product.sourceUrl}\n` : '') +
    `${rule}\n` +
    `Please confirm availability and the total with delivery. Thank you!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
