import Image from 'next/image';
import Link from 'next/link';
import type { CategoryTile } from '@/lib/home-api';
import { productImageSrc } from '@/lib/product-image';

const PLACEHOLDER = '/media/placeholder-product.svg';

/** The reference row shows five tiles; the rest live behind the "View all" link. */
const MAX_TILES = 5;

/**
 * "Shop by Category" — heading with a small "View all →" link, then rounded cards on a soft pink
 * tile showing the category image, name and product count.
 *
 * Data comes from `getCategoryTiles()`, which already drops empty categories, so every tile leads
 * to a shelf with something on it. On phones the tiles become a horizontal snap rail; from `sm` up
 * they settle into a grid (five across on large screens).
 */
export function CategoryTiles({ tiles }: { tiles: CategoryTile[] }) {
  if (tiles.length === 0) return null;

  const visible = tiles.slice(0, MAX_TILES);

  return (
    <section id="shop-categories" className="section scroll-mt-20">
      <div className="container space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="eyebrow">Shop</p>
            <h2 className="font-display text-2xl text-charcoal sm:text-3xl">Shop by Category</h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex min-h-11 items-center text-sm font-medium text-rose-gold transition hover:text-rose-600"
          >
            View all →
          </Link>
        </div>

        {/* `rail-hint` fades the clipped fifth tile on phones so the row reads as scrollable. */}
        <ul className="no-scrollbar rail-hint -mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
          {visible.map((tile) => (
            <li key={tile.slug} className="w-40 shrink-0 snap-start sm:w-auto">
              <Link
                href={`/shop?category=${encodeURIComponent(tile.slug)}`}
                className="group flex h-full flex-col rounded-2xl border border-charcoal/10 bg-blush-100 p-3 text-center transition hover:shadow-lift"
              >
                <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-blush-200">
                  {/*
                    The tile's picture is a product photograph — `getCategoryTiles()` picks a
                    representative one from the shelf — so it goes through the same pipeline as
                    every other product image. Rendering the raw stored URL here instead sent it
                    straight to next/image, which refuses any host missing from `remotePatterns`
                    and answered 400 for every supplier host the catalogue actually uses: four of
                    the five tiles were broken images on the homepage.
                  */}
                  <Image
                    src={productImageSrc(tile.image_url, PLACEHOLDER)}
                    alt={tile.name}
                    fill
                    sizes="(max-width: 640px) 40vw, (max-width: 1024px) 30vw, 18vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </span>
                <span className="mt-3 block truncate font-display text-sm text-charcoal">
                  {tile.name}
                </span>
                <span className="mt-0.5 block text-xs text-charcoal-soft">
                  {tile.product_count} {tile.product_count === 1 ? 'product' : 'products'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
