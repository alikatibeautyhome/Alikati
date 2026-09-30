'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ProductCard } from '@/components/shop/ProductCard';
import { PRODUCT_USE_TYPE_LABELS, productPrice } from '@/lib/commerce';
import { cn } from '@/lib/utils';
import type { Product, ProductCategory, ProductUseType } from '@/types/commerce.types';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

/** `all` is the neutral tab, not a `use_type` value — so it is kept out of the union. */
type UseTypeFilter = 'all' | ProductUseType;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
];

/**
 * The shelf tabs, in display order. A closed set that mirrors the `use_type` CHECK constraint, so
 * it is written down; the brand and concern lists are read off the products instead (see below).
 */
const USE_TYPE_TABS: { value: UseTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'retail', label: PRODUCT_USE_TYPE_LABELS.retail },
  { value: 'professional', label: PRODUCT_USE_TYPE_LABELS.professional },
];

/** Add or remove one value from a multi-select list without mutating it. */
function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Filterable product catalogue.
 *
 * Initial state is seeded from the server (which parsed the URL), so the first paint matches a
 * shared link. Every change is applied to the list immediately *and* mirrored into the URL with
 * `router.replace`, which triggers a soft server re-render — no full page reload.
 *
 * The whole catalogue is loaded and filtered in the browser: with a shop this size that lets every
 * facet — including concern and variant matching in the search box — read the same rows, which a
 * server round trip per filter could not do for a text[] column.
 */
export function ShopCatalog({
  products,
  categories,
  initialCategory = 'all',
  initialQuery = '',
  initialSort = 'newest',
  initialFeatured = false,
  initialStockOnly = false,
  initialBrands = [],
  initialUseType = 'all',
  initialConcerns = [],
}: {
  products: Product[];
  categories: ProductCategory[];
  initialCategory?: string;
  initialQuery?: string;
  initialSort?: SortKey;
  initialFeatured?: boolean;
  initialStockOnly?: boolean;
  initialBrands?: string[];
  initialUseType?: UseTypeFilter;
  initialConcerns?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  /* ------------------------------------------------------------------ facets
     Brand and concern lists come from the products actually on the shelf, so they can never drift
     from the catalogue. A concern with no products simply has no checkbox. */
  const availableBrands = React.useMemo(() => {
    const set = new Set<string>();
    for (const product of products) if (product.brand) set.add(product.brand);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const availableConcerns = React.useMemo(() => {
    const set = new Set<string>();
    for (const product of products) for (const concern of product.concerns ?? []) set.add(concern);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

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
  /* Seeded states are dropped when the value is not in the catalogue, so a stale link cannot leave
     an active-but-invisible filter behind. */
  const [brands, setBrands] = React.useState<string[]>(() =>
    initialBrands.filter((brand) => availableBrands.includes(brand))
  );
  const [useType, setUseType] = React.useState<UseTypeFilter>(initialUseType);
  const [concerns, setConcerns] = React.useState<string[]>(() =>
    initialConcerns.filter((concern) => availableConcerns.includes(concern))
  );

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
    if (useType !== 'all') params.set('use', useType);
    if (brands.length) params.set('brand', [...brands].sort().join(','));
    if (concerns.length) params.set('concern', [...concerns].sort().join(','));

    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [category, debouncedQuery, sort, stockOnly, featuredOnly, useType, brands, concerns, pathname, router]);

  const filtered = React.useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();

    const rows = products.filter((product) => {
      if (category !== 'all' && product.category?.slug !== category) return false;
      if (useType !== 'all' && product.use_type !== useType) return false;
      if (brands.length > 0 && !brands.includes(product.brand ?? '')) return false;
      // A concern filter matches when the product answers ANY of the selected concerns.
      if (concerns.length > 0 && !product.concerns?.some((concern) => concerns.includes(concern))) {
        return false;
      }
      if (featuredOnly && !product.is_featured) return false;
      if (stockOnly && product.stock_qty <= 0) return false;
      if (!needle) return true;

      const haystack = [
        product.name,
        product.brand ?? '',
        product.category?.name ?? '',
        product.short_description ?? '',
        product.concerns?.join(' ') ?? '',
        product.variant_value ?? '',
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
  }, [products, category, debouncedQuery, sort, stockOnly, featuredOnly, useType, brands, concerns]);

  /* Sibling options keyed by slug, for the "Also in …" hint on each card. Built from the loaded
     catalogue so a card never links to a sibling it cannot see. */
  const variantHintsBySlug = React.useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of products) {
      if (!product.variant_group) continue;
      const list = groups.get(product.variant_group) ?? [];
      list.push(product);
      groups.set(product.variant_group, list);
    }

    const hints = new Map<string, { value: string; slug: string }[]>();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      for (const product of list) {
        hints.set(
          product.slug,
          list
            .filter((sibling) => sibling.slug !== product.slug && sibling.variant_value)
            .map((sibling) => ({ value: sibling.variant_value as string, slug: sibling.slug }))
        );
      }
    }
    return hints;
  }, [products]);

  /* How many filters are narrowing the list, for the mobile button badge. Sort is an ordering
     rather than a filter, so it is left out; the search text counts as one. */
  const activeFilterCount =
    (category !== 'all' ? 1 : 0) +
    (useType !== 'all' ? 1 : 0) +
    (stockOnly ? 1 : 0) +
    (featuredOnly ? 1 : 0) +
    brands.length +
    concerns.length +
    (query.trim() ? 1 : 0);

  const hasFilters = activeFilterCount > 0 || sort !== 'newest';

  function clearFilters() {
    setCategory('all');
    setQuery('');
    setDebouncedQuery('');
    setSort('newest');
    setStockOnly(false);
    setFeaturedOnly(false);
    setBrands([]);
    setUseType('all');
    setConcerns([]);
    router.replace(pathname, { scroll: false });
  }

  /* ---------------------------------------------------------- mobile drawer
     The header's mobile menu is the house pattern for "a panel that owns the viewport": button with
     `aria-expanded`/`aria-controls`, Escape to close, body scroll locked, focus moved in. Here the
     panel is a right-hand slide-over with a dismissable backdrop, and focus returns to the trigger
     on close. */
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const filtersButtonRef = React.useRef<HTMLButtonElement>(null);
  const drawerPanelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerPanelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  /* If the viewport grows past `md` while the drawer is open, the desktop sidebar takes over —
     leaving the drawer mounted would keep the body scroll-locked with nothing on screen. */
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function closeDrawer() {
    setDrawerOpen(false);
    filtersButtonRef.current?.focus();
  }

  /* Rendered into both the desktop sidebar and the mobile drawer. Inputs are nested in their
     labels, so the same markup can appear twice without duplicate ids. */
  const filterFields = (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">
          Use
        </legend>
        <div className="flex flex-col gap-2">
          {USE_TYPE_TABS.map((tab) => {
            const active = useType === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() => setUseType(tab.value)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-left text-sm font-medium transition-colors active:scale-[0.99]',
                  active
                    ? 'border-rose-gold bg-blush-100 text-charcoal'
                    : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {availableConcerns.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">
            Concern
          </legend>
          <div className="space-y-0.5">
            {availableConcerns.map((concern) => (
              <label
                key={concern}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-charcoal-soft transition-colors hover:text-charcoal"
              >
                <input
                  type="checkbox"
                  checked={concerns.includes(concern)}
                  onChange={() => setConcerns((current) => toggleValue(current, concern))}
                  className="h-4 w-4 shrink-0 accent-rose-gold"
                />
                <span className="min-w-0">{concern}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {availableBrands.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">
            Brand
          </legend>
          <div className="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
            {availableBrands.map((brand) => (
              <label
                key={brand}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-charcoal-soft transition-colors hover:text-charcoal"
              >
                <input
                  type="checkbox"
                  checked={brands.includes(brand)}
                  onChange={() => setBrands((current) => toggleValue(current, brand))}
                  className="h-4 w-4 shrink-0 accent-rose-gold"
                />
                <span className="min-w-0">{brand}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal-soft">
          Availability
        </legend>
        <div className="space-y-0.5">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-charcoal-soft transition-colors hover:text-charcoal">
            <input
              type="checkbox"
              checked={stockOnly}
              onChange={(event) => setStockOnly(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-rose-gold"
            />
            In stock only
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm text-charcoal-soft transition-colors hover:text-charcoal">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(event) => setFeaturedOnly(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-rose-gold"
            />
            Featured only
          </label>
        </div>
      </fieldset>
    </div>
  );

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

      {/* Search and sort stay outside the drawer: they are how the shop is driven, not facets of it.
          Stacking all three used to push the first product most of a screen down the page. */}
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

        <div className="flex min-w-0 items-center gap-2 lg:w-auto lg:flex-none">
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
      </div>

      <div className="md:flex md:items-start md:gap-8">
        {/* Sticky sidebar from `md` up; below that the same fields live in the drawer. */}
        <aside className="hidden shrink-0 md:block md:w-60 lg:w-64">
          <div className="md:sticky md:top-20">
            <h2 className="mb-3 font-display text-lg text-charcoal">Filters</h2>
            {filterFields}
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-charcoal-soft" aria-live="polite">
              {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
            </p>

            <div className="flex items-center gap-2">
              <button
                ref={filtersButtonRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                className="flex min-h-11 items-center gap-2 rounded-full border border-charcoal/15 bg-white px-4 text-sm font-medium text-charcoal transition-colors hover:border-rose-gold/40 md:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-gold px-1 text-[11px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="min-h-10"
                >
                  Clear all
                </Button>
              )}
            </div>
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
                <ProductCard
                  key={product.id}
                  product={product}
                  variantHints={variantHintsBySlug.get(product.slug)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <div
            className="absolute inset-0 animate-fade-in bg-charcoal/40 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] max-w-full animate-slide-up flex-col bg-cream shadow-lift outline-none"
          >
            <div className="flex items-center justify-between gap-4 border-b border-charcoal/10 px-4 py-3">
              <h2 className="font-display text-lg text-charcoal">Filters</h2>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close filters"
                className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {filterFields}
            </div>

            <div className="flex items-center gap-2 border-t border-charcoal/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {hasFilters && (
                <Button type="button" variant="ghost" onClick={clearFilters} className="flex-1">
                  Clear all
                </Button>
              )}
              <Button type="button" onClick={closeDrawer} className="flex-1">
                Show {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
