import type { Metadata } from 'next';
import { getProductCategories, getProducts } from '@/lib/shop-api';
import { ShopCatalog } from '@/components/shop/ShopCatalog';
import type { ProductQuery } from '@/types/commerce.types';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Shop Beauty Products',
  description:
    'Salon-grade skincare, makeup, hair care and tools at Alikati Beauty Home, Attariya Chowk. Every price is in Nepali rupees (रू), with delivery in Attariya, Mahendranagar, Dhangadhi and across Kailali.',
  alternates: { canonical: '/shop' },
};

type SortKey = NonNullable<ProductQuery['sort']>;

const SORT_KEYS: readonly SortKey[] = ['newest', 'price-asc', 'price-desc', 'name'];

/** Pulls the first string out of a possibly-array query value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const categories = await getProductCategories();
  const categorySlugs = new Set(categories.map((category) => category.slug));

  const rawCategory = first(params.category);
  const category = rawCategory && categorySlugs.has(rawCategory) ? rawCategory : undefined;

  const rawSort = first(params.sort);
  const sort: SortKey = rawSort && (SORT_KEYS as readonly string[]).includes(rawSort)
    ? (rawSort as SortKey)
    : 'newest';

  const query = first(params.q);
  const featuredOnly = first(params.featured) === '1';
  const inStockOnly = first(params.stock) === '1';

  const products = await getProducts({
    categorySlug: category,
    search: query,
    sort,
    featuredOnly: featuredOnly || undefined,
    inStockOnly: inStockOnly || undefined,
  });

  return (
    <>
      <section className="section gradient-warm">
        <div className="container">
          <header className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="eyebrow">Shop</p>
            <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
              Beauty products, priced in NPR
            </h1>
            <p className="text-charcoal-soft">
              नमस्ते! The same salon-grade skincare, makeup and hair care our stylists use — now
              delivered to your door. Pay by cash on delivery, bank transfer, eSewa or Khalti.
            </p>
          </header>
        </div>
      </section>

      <section className="section pt-10 sm:pt-12">
        <div className="container">
          <ShopCatalog
            products={products}
            categories={categories}
            initialCategory={category ?? 'all'}
            initialQuery={query ?? ''}
            initialSort={sort}
            initialFeatured={featuredOnly}
            initialStockOnly={inStockOnly}
          />
        </div>
      </section>
    </>
  );
}
