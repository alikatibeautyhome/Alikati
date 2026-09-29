'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, MessageCircle, Minus, Plus, ShoppingCart } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useCart } from '@/components/shop/CartProvider';
import { MAX_QTY_PER_LINE } from '@/lib/cart';
import { isLowStock, isOutOfStock, productPrice, stockLabel } from '@/lib/commerce';
import { createGeneralContactLink } from '@/lib/whatsapp';
import { cn, formatNPR } from '@/lib/utils';
import type { Product } from '@/types/commerce.types';

/**
 * Purchase panel for the product detail page: variant picker, thumb-friendly quantity stepper,
 * add-to-cart confirmation and a WhatsApp fallback for customers who would rather order by chat.
 */
export function AddToCartPanel({
  product,
  whatsappNumber,
}: {
  product: Product;
  whatsappNumber: string;
}) {
  const { addProduct } = useCart();

  const outOfStock = isOutOfStock(product);
  const lowStock = isLowStock(product);
  const ceiling = Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.max(0, product.stock_qty)));

  const hasVariants = Boolean(product.variant_label) && product.variant_options.length > 0;
  const [variant, setVariant] = React.useState<string | null>(
    hasVariants ? product.variant_options[0] : null
  );
  const [quantity, setQuantity] = React.useState(1);
  const [added, setAdded] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  /* Retract the mobile action bar once the footer (and its links) comes into view, so it never
     covers the footer content on short pages. */
  const [barHidden, setBarHidden] = React.useState(false);
  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const footer = document.querySelector('footer');
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarHidden(entry.isIntersecting),
      { rootMargin: '0px 0px -32px 0px' }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  function changeQuantity(delta: number) {
    setQuantity((current) => Math.max(1, Math.min(ceiling, current + delta)));
  }

  function handleAdd() {
    if (outOfStock) return;
    addProduct(product, quantity, variant);
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 2200);
  }

  const whatsappHref = createGeneralContactLink({
    business_whatsapp: whatsappNumber,
    context: `I would like to order "${product.name}"${
      variant ? ` in ${variant}` : ''
    } from your shop. Is it available?`,
  });

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="space-y-5">
        <p
          className={cn(
            'text-sm font-medium',
            outOfStock ? 'text-danger' : lowStock ? 'text-warn' : 'text-success'
          )}
        >
          {stockLabel(product)}
        </p>

        {hasVariants && product.variant_label && (
          <div className="space-y-1.5">
            <Label htmlFor="product-variant">{product.variant_label}</Label>
            <div className="flex flex-wrap gap-2">
              {product.variant_options.map((option) => {
                const active = variant === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setVariant(option)}
                    aria-current={active ? 'true' : undefined}
                    disabled={outOfStock}
                    className={cn(
                      'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.98]',
                      active
                        ? 'border-rose-gold bg-rose-gold text-white'
                        : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal',
                      outOfStock && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-full border border-charcoal/15 bg-white p-1">
            <button
              type="button"
              onClick={() => changeQuantity(-1)}
              disabled={outOfStock || quantity <= 1}
              aria-label="Decrease quantity"
              className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span
              className="min-w-8 text-center font-display text-lg text-charcoal"
              aria-live="polite"
              aria-label={`Quantity ${quantity}`}
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => changeQuantity(1)}
              disabled={outOfStock || quantity >= ceiling}
              aria-label="Increase quantity"
              className="flex h-11 w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="font-display text-2xl text-price">
            {formatNPR(productPrice(product) * quantity)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="lg"
              onClick={handleAdd}
              disabled={outOfStock}
              className="flex-1 sm:flex-none"
            >
              {added ? (
                <>
                  <Check className="h-5 w-5" aria-hidden="true" />
                  Added to cart
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                  {outOfStock ? 'Out of stock' : 'Add to cart'}
                </>
              )}
            </Button>

            {added && (
              <Link href="/cart" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Go to cart
              </Link>
            )}
          </div>

          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'secondary', size: 'lg' })}
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Order on WhatsApp
          </a>

          <span className="sr-only" aria-live="polite">
            {added ? `${product.name} added to cart` : ''}
          </span>
        </div>

          {!outOfStock && product.stock_qty > 0 && (
            <p className="text-xs text-charcoal-soft">
              Maximum {ceiling} per order — need more? Message us on WhatsApp.
            </p>
          )}
        </div>
      </Card>

      {/* Sticky purchase bar for narrow screens. The floating WhatsApp button is suppressed on
          this route (it would sit on top of this bar), so the full width is available to the
          product name — that was previously truncated mid-word to leave room for a button that
          is no longer there. It still retracts before the footer. */}
      {!barHidden && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-charcoal/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-lift backdrop-blur lg:hidden">
          <div className="container flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-charcoal-soft">{product.name}</p>
              <p className="font-display text-lg text-price">
                {formatNPR(productPrice(product) * quantity)}
              </p>
            </div>

            <Button
              type="button"
              onClick={handleAdd}
              disabled={outOfStock}
              className="h-12 shrink-0 px-5"
            >
              {outOfStock ? (
                'Out of stock'
              ) : added ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                  Add to cart
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
