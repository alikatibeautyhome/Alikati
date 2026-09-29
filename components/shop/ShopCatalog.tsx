'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ProductCard } from '@/components/shop/ProductCard';
import { productPrice } from '@/lib/commerce';
import { cn } from '@/lib/utils';
import type { Product, ProductCategory } from '@/types/commerce.types';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
];

/**
 * Filterable product catalogue.
 *
 * Initial state is seeded from the server (which parsed the URL), so the first paint matches a
 * shared link. Every change is applied to the list immediately *and* mirrored into the URL with
 * `router.replace`, which triggers a soft server re-render — no full page reload.
 */
export function ShopCatalog({
  products,
  categories,
  initialCategory = 'all',
  initialQuery = '',
  initialSort = 'newest',
  initialFeatured = false,
  initialStockOnly = false,
}: {
  products: Product[];
  categories: ProductCategory[];
  initialCategory?: string;
  initialQuery?: string;
  initialSort?: SortKey;
  initialFeatured?: boolean;
  initialStockOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isRealCategory = React.useCallback(
    (value: string) => categories.some((category) => category.slug === value),
    [categories]
  );

  const [category, setCategory] = React.useState<string>(() =>
    initialCategory === 'all' || isRealCategory(initialCategory) ? initialCategory : 'all'
  );
  const [query, setQuery] = React.useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState(initialQuery);
  const [sort, setSort] = React.useState<SortKey>(initialSort);
  const [stockOnly, setStockOnly] = React.useState(initialStockOnly);
  const [featuredOnly, setFeaturedOnly] = React.useState(initialFeatured);

  /* Debounce the search box so we do not rewrite the URL on every keystroke. */
  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(handle);
  }, [query]);

  /* Keep the URL in step with the active filters (skipped for the first, server-rendered pass). */
  const firstPass = React.useRef(true);
  React.useEffect(() => {
    if (firstPass.current) {
      firstPass.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (sort !== 'newest') params.set('sort', sort);
    if (featuredOnly) params.set('featured', '1');
    if (stockOnly) params.set('stock', '1');

    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [category, debouncedQuery, sort, stockOnly, featuredOnly, pathname, router]);

  const filtered = React.useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();

    const rows = products.filter((product) => {
      if (category !== 'all' && product.category?.slug !== category) return false;
      if (featuredOnly && !product.is_featured) return false;
      if (stockOnly && product.stock_qty <= 0) return false;
      if (!needle) return true;

      const haystack = [
        product.name,
        product.brand ?? '',
        product.short_description ?? '',
        product.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });

    rows.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return productPrice(a) - productPrice(b);
        case 'price-desc':
          return productPrice(b) - productPrice(a);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name);
      }
    });

    return rows;
  }, [products, category, debouncedQuery, sort, stockOnly, featuredOnly]);

  const hasFilters =
    category !== 'all' || query.trim() !== '' || stockOnly || featuredOnly || sort !== 'newest';

  function clearFilters() {
    setCategory('all');
    setQuery('');
    setDebouncedQuery('');
    setSort('newest');
    setStockOnly(false);
    setFeaturedOnly(false);
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="space-y-6">
      {/* `rail-hint` fades the clipped chip at the right edge on phones, so the row reads as
          "there is more this way" rather than as a layout bug. */}
      <div className="no-scrollbar rail-hint -mx-4 flex scroll-pl-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ slug: 'all', name: 'All' }, ...categories].map((chip) => {
          const active = category === chip.slug;
          return (
            <button
              key={chip.slug}
              type="button"
              onClick={() => setCategory(chip.slug)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.98]',
                active
                  ? 'border-rose-gold bg-rose-gold text-white'
                  : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
              )}
            >
              {chip.name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="shop-search" className="sr-only">
            Search products
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft"
            aria-hidden="true"
          />
          <Input
            id="shop-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skincare, makeup, hair care…"
            className="pl-9"
          />
        </div>

        {/* On phones the sort control and the stock toggle share one row under the search box.
            Stacking all three used to push the first product most of a screen down the page. */}
        <div className="flex flex-row items-center gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:w-auto lg:flex-none">
            <Label htmlFor="shop-sort" className="whitespace-nowrap text-charcoal-soft">
              Sort
            </Label>
            <Select
              id="shop-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="min-w-0 flex-1 lg:w-44 lg:flex-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-charcoal/15 bg-white px-3 text-sm font-medium text-charcoal-soft sm:px-4 lg:w-auto lg:justify-start">
            <input
              type="checkbox"
              checked={stockOnly}
              onChange={(event) => setStockOnly(event.target.checked)}
              className="h-4 w-4 accent-rose-gold"
            />
            In stock only
          </label>

          {featuredOnly && (
            <button
              type="button"
              onClick={() => setFeaturedOnly(false)}
              className="flex min-h-11 items-center justify-center gap-1 rounded-full border border-rose-gold/40 bg-blush-100 px-3 text-sm font-medium text-rose-gold lg:w-auto"
            >
              Featured only
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Remove featured filter</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-charcoal-soft" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
        </p>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="min-h-10"
          >
            Clear filters
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="font-display text-lg text-charcoal">No products match those filters</p>
          <p className="mt-1 text-sm text-charcoal-soft">
            Try a different keyword or category. If you cannot find what you need, message us on
            WhatsApp and we will check the shelf for you.
          </p>
          <Button type="button" className="mt-5" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
