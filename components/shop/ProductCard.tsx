'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCart } from '@/components/shop/CartProvider';
import { WatermarkBadge } from '@/components/shop/WatermarkBadge';
import { useWatermark } from '@/components/shop/WatermarkProvider';
import { productImageSrc } from '@/lib/product-image';
import { isWatermarkVisible } from '@/lib/watermark';
import {
  isLowStock,
  isOutOfStock,
  productDiscountPercent,
  productPrice,
  stockLabel,
} from '@/lib/commerce';
import { cn, formatNPR } from '@/lib/utils';
import type { Product } from '@/types/commerce.types';

const PLACEHOLDER = '/media/placeholder-product.svg';

/**
 * Product tile for the catalogue, the landing-page strip and the related-products grid.
 *
 * Presentation follows the owner's reference storefront: image on a soft pink tile, the discount
 * as a red badge, green price with the old price struck through in grey, a star row and an
 * "Add to cart" pill.
 *
 * Adding to the cart is the only interactive default. Passing `onAdd` replaces that behaviour,
 * so the same card can be rendered read-only (for example inside an informational section).
 *
 * Ratings are shown ONLY when `rating_average` is set — a product with no reviews shows no stars
 * rather than a fabricated score.
 */
export function ProductCard({
  product,
  onAdd,
  className,
}: {
  product: Product;
  onAdd?: (product: Product) => void;
  className?: string;
}) {
  const { addProduct } = useCart();
  const [added, setAdded] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const outOfStock = isOutOfStock(product);
  const lowStock = isLowStock(product);
  const discount = productDiscountPercent(product);
  const price = productPrice(product);
  // Routed through the processing endpoint: white canvas, supplier watermark removed, salon mark
  // stamped. See app/api/product-image/route.ts.
  /*
    When the badge is drawn in the DOM below, the image is requested *without* the baked mark —
    otherwise the logo would be printed twice, once in the pixels and once on top of them.
    Surfaces that render no overlay (link previews, order confirmations, WhatsApp messages, the
    admin console) keep requesting the image with the mark baked in.
  */
  const watermark = useWatermark();
  const badgeVisible = isWatermarkVisible(watermark);

  /*
    The gallery. `images[0]` is the primary image; `image_url` is only a fallback for any row that
    predates the gallery column. Rebuilt rather than trusted: a blank or repeated entry would
    otherwise render as an empty card or two identical frames.
  */
  const gallery = React.useMemo(() => {
    const list = (product.images?.length ? product.images : [product.image_url])
      .map((url) => (url ?? '').trim())
      .filter(Boolean);
    return [...new Set(list)];
  }, [product.images, product.image_url]);

  /** Which gallery frame the visitor is looking at. Hover always reveals the *next* one. */
  const [active, setActive] = React.useState(0);
  const shown = gallery.length > 0 ? active % gallery.length : 0;

  const baseImage = gallery[shown] ?? null;
  const hoverImage = gallery.length > 1 ? gallery[(shown + 1) % gallery.length] : null;

  const baseSrc = productImageSrc(baseImage, PLACEHOLDER, { brandMark: !badgeVisible });
  const hoverSrc = productImageSrc(hoverImage, PLACEHOLDER, { brandMark: !badgeVisible });

  const ratingValue = typeof product.rating_average === 'number' ? product.rating_average : null;
  const ratingCount = typeof product.rating_count === 'number' ? product.rating_count : 0;

  function handleAdd() {
    if (outOfStock) return;
    if (onAdd) onAdd(product);
    else addProduct(product, 1);

    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1800);
  }

  return (
    <Card
      className={cn(
        // `group` is what every hover rule below hangs off. The lift uses the project's own
        // `shadow-lift` elevation token rather than a raw `shadow-xl`, so the resting and hover
        // states are both drawn from the house shadow scale.
        'group flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className
      )}
    >
      <Link
        href={`/shop/${product.slug}`}
        className="product-media relative block aspect-square w-full overflow-hidden bg-[#ffffff]"
      >
        {/*
          Square frame, `object-contain`: the whole product on a seamless white canvas, nothing
          cropped. Every catalogue photo is a square packshot (1080² or 1600²), so a square frame
          fits them exactly — and it gives the product more room than the 4:3 box this replaces.
          The same frame also fixes the handful of wide 327×150 images, which a cropping fit was
          slicing to a narrow strip. `bg-[#ffffff]` rather than `bg-white` on purpose: the dark-mode
          bridge in globals.css remaps `bg-white` to the dark surface, which would frame the white
          product shots in a dark box in dark mode.
        */}
        {/* Both layers live inside one scaling wrapper, so the zoom and the crossfade do not fight
            each other and the frame never jumps as the images swap. */}
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105">
          <Image
            src={baseSrc}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              'object-contain transition-opacity duration-500',
              hoverImage ? 'group-hover:opacity-0' : ''
            )}
          />

          {hoverImage ? (
            <Image
              src={hoverSrc}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="absolute inset-0 object-contain opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          ) : null}
        </div>

        {/*
          A soft radial shadow where the product meets the canvas.

          It has to sit *over* the photo, not behind it: every packshot is an opaque white square,
          so a shadow painted underneath would simply be hidden by the image itself. Drawn as a
          low, wide ellipse so it reads as the product resting on a surface rather than as a
          vignette, and kept away from the top of the frame where the product's own label sits.
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[14%] bottom-[6%] h-[9%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(30,27,28,0.20),rgba(30,27,28,0)_72%)] blur-[6px]"
        />
        {discount !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-sale px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft sm:left-3 sm:top-3 sm:px-2.5 sm:text-xs">
            -{discount}%
          </span>
        )}

        {/* Brand badge, bottom-left over the product photo. Draws nothing at all when the admin
            has switched it off or has not uploaded a logo. */}
        <WatermarkBadge />

        {/*
          Quick-view dots: flick through the angles without leaving the grid, which is also the
          only way to see them on a touch screen — there is no hover there.

          Bottom-right rather than bottom-centre so they never collide with the brand badge on the
          opposite corner, and inside the card's link, so each click has to stop the navigation
          it would otherwise trigger.
        */}
        {gallery.length > 1 ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/75 px-1.5 py-1 backdrop-blur-sm">
            {gallery.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show image ${index + 1} of ${gallery.length}`}
                aria-current={index === shown}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActive(index);
                }}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  index === shown ? 'bg-charcoal/75' : 'bg-charcoal/25 hover:bg-charcoal/50'
                )}
              />
            ))}
          </div>
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 lg:p-5">
        {/* Category chip. Rendered only when the joined relation is present, so a card built from a
            query that does not select `category:product_categories(...)` simply omits it. */}
        {product.category?.name ? (
          <span className="w-fit rounded-full bg-charcoal/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-charcoal-soft ring-1 ring-inset ring-charcoal/10">
            {product.category.name}
          </span>
        ) : null}

        {/* Clamped to three lines on phones: the imported supplier names are long, and at 390px a
            two-line clamp cut most of them off mid-word. Still two lines from `sm` up. */}
        <h3 className="line-clamp-3 break-words font-display text-base leading-snug text-charcoal sm:line-clamp-2 sm:text-lg">
          <Link href={`/shop/${product.slug}`} className="hover:text-rose-gold">
            {product.name}
          </Link>
        </h3>

        {product.short_description && (
          <p className="line-clamp-2 break-words text-xs text-charcoal-soft sm:text-sm">
            {product.short_description}
          </p>
        )}

        {ratingValue !== null && (
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => (
                <Star
                  key={index}
                  className={cn(
                    'h-3.5 w-3.5',
                    index < Math.round(ratingValue) ? 'fill-gold text-gold' : 'text-charcoal/20'
                  )}
                />
              ))}
            </span>
            <span className="text-xs font-medium text-charcoal">{ratingValue.toFixed(1)}</span>
            {ratingCount > 0 && (
              <span className="text-xs text-charcoal-soft">({ratingCount})</span>
            )}
            <span className="sr-only">
              {`Rated ${ratingValue.toFixed(1)} out of 5${
                ratingCount > 0 ? ` from ${ratingCount} reviews` : ''
              }`}
            </span>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-2">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-lg text-price">{formatNPR(price)}</span>
            {discount !== null && (
              <span className="text-xs text-charcoal-soft line-through">
                {formatNPR(product.price_npr)}
              </span>
            )}
          </p>

          {/*
            Availability badge, carrying the unit count.

            The low and out-of-stock states already state their own figure through `stockLabel`
            ("Only 4 left"), so only the healthy case needs a number adding — it would otherwise
            read a bare "In stock". No stock rule is re-derived here: `outOfStock` and `lowStock`
            come from `lib/commerce.ts`.
          */}
          <span
            className={cn(
              'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
              outOfStock
                ? 'bg-danger/10 text-danger ring-danger/25'
                : lowStock
                  ? 'bg-warn/10 text-warn ring-warn/25'
                  : 'bg-success/10 text-success ring-success/25'
            )}
          >
            {outOfStock || lowStock ? stockLabel(product) : `${product.stock_qty} in stock`}
          </span>

          {outOfStock ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              className="min-h-11 w-full dark:bg-white/10"
            >
              Out of stock
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              className="min-h-11 w-full"
              aria-describedby={`add-status-${product.id}`}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              {added ? 'Added ✓' : 'Add to cart'}
            </Button>
          )}

          <span id={`add-status-${product.id}`} className="sr-only" aria-live="polite">
            {added ? `${product.name} added to cart` : ''}
          </span>
        </div>
      </div>
    </Card>
  );
}
