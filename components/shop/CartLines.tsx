'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { useCart } from '@/components/shop/CartProvider';
import { MAX_QTY_PER_LINE } from '@/lib/cart';
import { productImageSrc } from '@/lib/product-image';
import { formatNPR } from '@/lib/utils';

const PLACEHOLDER = '/media/placeholder-product.svg';

/**
 * Editable cart body used by the /cart page. Reads the cart from context, so it takes no props.
 */
export function CartLines() {
  const { lines, setQuantity, remove, clear, keyOf } = useCart();

  if (lines.length === 0) return null;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {lines.map((line) => {
          const key = keyOf(line);
          const ceiling = Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.max(0, line.stock_qty)));

          return (
            <li key={key} className="panel flex gap-3 p-3 sm:gap-4 sm:p-4">
              <Link
                href={`/shop/${line.slug}`}
                className="product-media relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#ffffff] sm:h-24 sm:w-24"
              >
                <Image
                  src={productImageSrc(line.image_url, PLACEHOLDER)}
                  alt={line.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 break-words font-display text-base text-charcoal">
                      <Link href={`/shop/${line.slug}`} className="hover:text-rose-gold">
                        {line.name}
                      </Link>
                    </h3>
                    {line.variant && (
                      <p className="break-words text-xs text-charcoal-soft">
                        Variant: {line.variant}
                      </p>
                    )}
                    <p className="text-xs text-price">
                      {formatNPR(line.unit_price_npr)} each
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(key)}
                    aria-label={`Remove ${line.name} from cart`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-charcoal-soft transition-colors hover:bg-danger/10 hover:text-danger active:bg-danger/15"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-charcoal/15 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setQuantity(key, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label={`Decrease quantity of ${line.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 active:bg-blush-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span
                      className="min-w-7 text-center text-sm font-medium text-charcoal"
                      aria-live="polite"
                    >
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(key, line.quantity + 1)}
                      disabled={line.quantity >= ceiling}
                      aria-label={`Increase quantity of ${line.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 active:bg-blush-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <p className="shrink-0 font-display text-lg text-price">
                    {formatNPR(line.unit_price_npr * line.quantity)}
                  </p>
                </div>

                {line.quantity >= ceiling && (
                  <p className="text-xs text-warn">Max {ceiling} per order</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={clear}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-danger active:bg-charcoal/10"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Clear cart
      </button>
    </div>
  );
}
