'use client';

import Link from 'next/link';
import { ShoppingBag, Truck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CartLines } from '@/components/shop/CartLines';
import { WhatsAppOrderButton } from '@/components/shop/WhatsAppOrderButton';
import { useCart } from '@/components/shop/CartProvider';
import { formatNPR } from '@/lib/utils';

/**
 * Cart page. A client component because the cart lives in browser storage; the corresponding
 * no-index directive is applied on the checkout and order pages, which are server components.
 */
export default function CartPage() {
  const { lines, totals, hydrated, whatsappNumber } = useCart();

  if (!hydrated) {
    return (
      <section className="section">
        <div className="container">
          <div className="panel p-10 text-center text-charcoal-soft">Loading your cart…</div>
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <div className="panel mx-auto max-w-md p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
              <ShoppingBag className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-xl text-charcoal">Your cart is empty</h1>
            <p className="mt-1 text-sm text-charcoal-soft">
              Browse our skincare, makeup and hair care range and add something you love.
            </p>
            <Link href="/shop" className={buttonVariants({ className: 'mt-5' })}>
              Browse the shop
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container space-y-8">
        <header className="space-y-2">
          <p className="eyebrow">Your cart</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
            {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'} in your cart
          </h1>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
          <CartLines />

          <aside className="space-y-4 lg:sticky lg:top-24">
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="font-display text-xl text-charcoal">Order summary</h2>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-charcoal-soft">Subtotal</dt>
                  <dd className="font-medium text-price">{formatNPR(totals.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-charcoal-soft">Delivery</dt>
                  <dd className="font-medium text-price">
                    {totals.shipping === 0 ? 'Free' : formatNPR(totals.shipping)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-charcoal/10 pt-2 text-base">
                  <dt className="font-medium text-charcoal">Total</dt>
                  <dd className="font-display text-xl text-price">{formatNPR(totals.total)}</dd>
                </div>
              </dl>

              {totals.freeShippingRemaining > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-blush-100 p-3 text-xs text-charcoal-soft">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Add {formatNPR(totals.freeShippingRemaining)} more for free delivery.
                </p>
              )}

              <Link href="/checkout" className={buttonVariants({ size: 'lg', className: 'w-full' })}>
                Proceed to checkout
              </Link>

              {/* The no-registration path: the whole cart written out in a chat, no form to fill. */}
              <WhatsAppOrderButton
                items={lines.map((line) => ({
                  name: line.name,
                  variant: line.variant,
                  quantity: line.quantity,
                  line_total_npr: line.unit_price_npr * line.quantity,
                }))}
                totalNpr={totals.total}
                whatsappNumber={whatsappNumber}
                hint="No account needed — we confirm stock and delivery in chat."
                className="w-full"
              />

              <Link
                href="/shop"
                className="block text-center text-sm text-charcoal-soft underline underline-offset-4 hover:text-charcoal"
              >
                Continue shopping
              </Link>
            </Card>
          </aside>
        </div>
      </div>
    </section>
  );
}
