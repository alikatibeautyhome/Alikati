'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ExternalLink, ImageOff, MessageCircle, Package, Search, Sparkles } from 'lucide-react';
import { productImageSrc } from '@/lib/product-image';
import {
  WELL10_CARD_TAG,
  WELL10_CATEGORIES,
  WELL10_PRODUCTS,
  WELL10_SOURCE_LABEL,
  WELL10_SOURCE_URL,
  WELL10_TOTALS,
  createWell10InquiryLink,
  filterWell10Products,
  formatWell10Price,
  summariseWell10,
} from '@/lib/well10-catalog';
import { cn } from '@/lib/utils';
import type { Well10Filter, Well10Product } from '@/types/well10.types';

/**
 * The Well 10 Professional showcase.
 *
 * A self-contained brand section: dark slate surfaces with gold accents, deliberately independent
 * of the app's rose/cream theme tokens so the supplier's line keeps its own identity without
 * touching `globals.css` or the theme variables.
 *
 * The range is a **showcase, not a catalogue page**: these SKUs have no `products` row, so the
 * call to action is a WhatsApp enquiry rather than "add to cart" — see `lib/well10-catalog.ts`.
 * `whatsappNumber` is passed in from the server page because the business number lives in
 * `salon_settings`; when it is missing the button is hidden rather than rendered dead.
 */
export function Well10Showcase({ whatsappNumber }: { whatsappNumber?: string | null }) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<Well10Filter>('All');
  /** Slugs whose photograph failed to load, so the card can fall back to its branded tile. */
  const [brokenImages, setBrokenImages] = React.useState<readonly string[]>([]);

  const visible = React.useMemo(
    () => filterWell10Products(WELL10_PRODUCTS, { query, category }),
    [query, category]
  );
  const filtered = React.useMemo(() => summariseWell10(visible), [visible]);

  const isFiltered = query.trim().length > 0 || category !== 'All';

  const markImageBroken = React.useCallback((slug: string) => {
    setBrokenImages((current) => (current.includes(slug) ? current : [...current, slug]));
  }, []);

  return (
    <div className="bg-slate-950 text-slate-100">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="container py-12 sm:py-16">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E8C766]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Professional Salon Range
              </span>

              <h1 className="mt-5 font-display text-3xl leading-tight sm:text-4xl lg:text-5xl">
                <span className="bg-gradient-to-r from-[#F2DFA4] via-[#D4AF37] to-[#B8912B] bg-clip-text text-transparent">
                  Well10 Cosmetics
                </span>
              </h1>

              <p className="mt-3 text-base text-slate-300 sm:text-lg">
                Professional Salon Hair Care &amp; Treatment Solutions
              </p>

              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Salon-grade treatments, smoothing systems, toning shampoos and finishing serums from
                the Well 10 Professional line — stocked at Alikati Beauty Home, Attariya Chowk.
              </p>
            </div>

            <a
              href={WELL10_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-[#D4AF37]/50 hover:text-[#E8C766]"
            >
              Official store: {WELL10_SOURCE_LABEL}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>

          {/* Order-summary counters — derived from the catalogue, never hard-coded. */}
          <dl className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile label="Product lines" value={String(WELL10_TOTALS.lines)} />
            <SummaryTile
              label="Total stock units"
              value={`${WELL10_TOTALS.units} items`}
              highlight
            />
            <SummaryTile
              label="Total inventory value (NPR)"
              value={formatWell10Price(WELL10_TOTALS.valueNpr)}
              highlight
            />
          </dl>
        </div>
      </section>

      {/* ── Controls ───────────────────────────────────────────────────────────── */}
      <section className="container py-8 sm:py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search treatments, shampoos, serums…"
              aria-label="Search the Well 10 range"
              className="w-full rounded-full border border-white/15 bg-slate-900/70 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#D4AF37]/60 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/25"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by product type">
            {(['All', ...WELL10_CATEGORIES] as const).map((option) => {
              const active = category === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'border-[#D4AF37] bg-[#D4AF37] text-slate-950'
                      : 'border-white/15 text-slate-300 hover:border-[#D4AF37]/50 hover:text-[#E8C766]'
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live count. The headline totals above never change; this reports the current view. */}
        <p className="mt-4 text-xs text-slate-400" role="status">
          Showing <span className="font-semibold text-slate-200">{filtered.lines}</span> of{' '}
          {WELL10_TOTALS.lines} lines
          {isFiltered ? (
            <>
              {' · '}
              {filtered.units} items · {formatWell10Price(filtered.valueNpr)}
            </>
          ) : null}
        </p>

        {/* ── Grid ─────────────────────────────────────────────────────────────── */}
        {visible.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-slate-900/50 px-6 py-14 text-center">
            <Package className="mx-auto h-8 w-8 text-[#D4AF37]" aria-hidden />
            <p className="mt-4 text-sm font-semibold text-slate-200">No products match that search.</p>
            <p className="mt-1 text-xs text-slate-400">
              Try a different product name, or clear the filters to see all {WELL10_TOTALS.lines} lines.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
              className="mt-5 rounded-full border border-[#D4AF37]/60 px-4 py-1.5 text-xs font-semibold text-[#E8C766] transition-colors hover:bg-[#D4AF37] hover:text-slate-950"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((product) => (
              <li key={product.slug} className="h-full">
                <Well10Card
                  product={product}
                  whatsappNumber={whatsappNumber}
                  imageBroken={brokenImages.includes(product.slug)}
                  onImageError={markImageBroken}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4 text-xs leading-relaxed text-slate-400">
          Prices are per pack in NPR and exclude delivery. To order, send an enquiry on WhatsApp and
          we will confirm stock, delivery and the final total.
        </p>
      </section>
    </div>
  );
}

/** One headline figure. `highlight` marks the two counters the owner asked to be prominent. */
function SummaryTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-5 py-4',
        highlight
          ? 'border-[#D4AF37]/35 bg-[#D4AF37]/5'
          : 'border-white/10 bg-white/[0.03]'
      )}
    >
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</dt>
      <dd
        className={cn(
          'mt-1.5 font-display text-2xl',
          highlight ? 'text-[#E8C766]' : 'text-slate-100'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Well10Card({
  product,
  whatsappNumber,
  imageBroken,
  onImageError,
}: {
  product: Well10Product;
  whatsappNumber?: string | null;
  imageBroken: boolean;
  onImageError: (slug: string) => void;
}) {
  const inquiryHref = React.useMemo(
    () => createWell10InquiryLink(product, whatsappNumber),
    [product, whatsappNumber]
  );

  const showFallback = !product.imageUrl || imageBroken;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 transition-colors hover:border-[#D4AF37]/40">
      {/* ── Thumbnail ───────────────────────────────────────────────────────── */}
      {/* `bg-white` because every shot is a packshot on white; contain, never crop. */}
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        {showFallback ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 to-slate-900 px-6 text-center">
            <ImageOff className="h-7 w-7 text-[#D4AF37]" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
              Photo pending
            </span>
            <span className="text-[11px] leading-snug text-slate-400">{product.sizeLabel}</span>
          </div>
        ) : (
          <Image
            src={productImageSrc(product.imageUrl, undefined, { stripWatermark: false })}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-5"
            onError={() => onImageError(product.slug)}
          />
        )}

        <span className="absolute left-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#E8C766] ring-1 ring-inset ring-[#D4AF37]/40 backdrop-blur">
          {product.category}
        </span>

        <span className="absolute right-3 top-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-semibold text-slate-100 ring-1 ring-inset ring-white/20 backdrop-blur">
          {product.stockQty} in stock
        </span>

        {product.imageIsRepresentative && !showFallback ? (
          <span
            className="absolute bottom-3 left-3 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] text-slate-300 ring-1 ring-inset ring-white/15 backdrop-blur"
            title="Official photograph of this product line; the 50 ml pack is not pictured by the supplier."
          >
            Representative photo
          </span>
        ) : null}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {WELL10_CARD_TAG}
        </p>

        <h3 className="font-display text-base leading-snug text-slate-100">{product.title}</h3>

        <span className="w-fit rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-slate-300">
          {product.sizeLabel}
        </span>

        <p className="text-xs leading-relaxed text-slate-400">{product.description}</p>

        {/* Price pinned to the card foot so it lines up across a row of unequal descriptions. */}
        <div className="mt-auto space-y-3 pt-2">
          <p className="font-display text-xl text-[#E8C766]">
            {formatWell10Price(product.priceNpr)}
            <span className="ml-2 align-middle text-[10px] font-normal uppercase tracking-wider text-slate-500">
              per pack · NPR
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {inquiryHref ? (
              <a
                href={inquiryHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-[#E8C766]"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                Inquire
              </a>
            ) : null}

            {/* Hand-off to the real catalogue entry, where the item can be added to the cart. */}
            <Link
              href={product.shopHref}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-[#D4AF37]/50 hover:text-[#E8C766]"
            >
              Shop
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
