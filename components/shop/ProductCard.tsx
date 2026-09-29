'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCart } from '@/components/shop/CartProvider';
import { productImageSrc } from '@/lib/product-image';
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
  const imageSrc = productImageSrc(product.image_url, PLACEHOLDER);

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
    <Card className={cn('flex h-full flex-col overflow-hidden', className)}>
      <Link
        href={`/shop/${product.slug}`}
        className="product-media relative block aspect-[4/3] w-full bg-[#ffffff]"
      >
        {/*
          White canvas + `object-contain`: the whole product is shown on white rather than
          cropped. Every catalogue photo is a square white-background packshot (1080² or 1600²),
          so a 4:3 frame with `object-cover` was cutting ~12.5% off the top and bottom of each
          one — roughly 8% of the product itself, given the 4.6% margin the photos carry.
          `contain` also fixes the handful of wide 327×150 images, which `cover` was slicing to a
          narrow strip. `bg-[#ffffff]` rather than `bg-white` on purpose: the dark-mode bridge in
          globals.css remaps `bg-white` to the dark surface, which would frame the white product
          shots in a dark box in dark mode.
        */}
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-contain"
        />
        {discount !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-sale px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft sm:left-3 sm:top-3 sm:px-2.5 sm:text-xs">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4 lg:p-5">
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

          <p
            className={cn(
              'text-xs font-medium',
              outOfStock ? 'text-danger' : lowStock ? 'text-warn' : 'text-success'
            )}
          >
            {stockLabel(product)}
          </p>

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
