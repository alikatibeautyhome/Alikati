import type { Metadata } from 'next';
import { getProductCategories, getProducts } from '@/lib/shop-api';
import { ShopCatalog } from '@/components/shop/ShopCatalog';
import type { ProductQuery, ProductUseType } from '@/types/commerce.types';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: 'Buy Original Cosmetics & Salon Products | Alikati Shop' },
  description:
    'Shop 100% genuine skincare, cosmetics, and haircare online. Fast delivery across Attariya and Kailali with cash on delivery and easy 7-day returns guaranteed.',
  alternates: { canonical: '/shop' },
};

type SortKey = NonNullable<ProductQuery['sort']>;

const SORT_KEYS: readonly SortKey[] = ['newest', 'price-asc', 'price-desc', 'name'];

/** Pulls the first string out of a possibly-array query value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Reads a comma-joined multi-select param (`brand`, `concern`) into a clean list. */
function list(value: string | string[] | undefined): string[] {
  const raw = first(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
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

  const rawUse = first(params.use);
  const useType: ProductUseType | undefined =
    rawUse === 'retail' || rawUse === 'professional' ? rawUse : undefined;

  /*
    The free-text search and the brand/concern facets are applied in the browser (ShopCatalog), over
    the whole active catalogue. Searching on the server would drop a row before the browser could
    match it by its concern or its variant value — a `text[]` column cannot be asked for a substring.
    With a shop this size the extra rows are cheaper than a facet that only half works.
  */
  const products = await getProducts({
    categorySlug: category,
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
              Stylist-Tested Skincare, Haircare &amp; Beauty Products
            </h1>
            <p className="text-charcoal-soft">
              नमस्ते! The same salon-grade skincare, makeup and hair care our stylists use — now
              delivered to your door. Pay by cash on delivery or bank transfer.
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
            initialBrands={list(params.brand)}
            initialUseType={useType ?? 'all'}
            initialConcerns={list(params.concern)}
          />
        </div>
      </section>
    </>
  );
}
