import Link from 'next/link';
import { ProductCard } from '@/components/shop/ProductCard';
import type { Product } from '@/types/commerce.types';

/**
 * "Best Sellers" — heading with a "View all products →" link, then the product grid.
 *
 * Cards are the restyled `ProductCard`, so the two-up mobile grid, green prices and red discount
 * badges stay consistent with `/shop`. Server-renderable; only the cards themselves are
 * interactive.
 */
export function BestSellers({
  products,
  description = 'Salon-grade skincare, makeup and hair care — the same products our stylists reach for. Prices in NPR, delivery across Kailali.',
}: {
  products: Product[];
  description?: string;
}) {
  return (
    <section className="section bg-cream-100">
      <div className="container space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">Shop</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">Best Sellers</h2>
            <p className="max-w-xl text-charcoal-soft">{description}</p>
          </div>
          <Link
            href="/shop"
            className="inline-flex min-h-11 items-center text-sm font-medium text-rose-gold transition hover:text-rose-600"
          >
            View all products →
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="panel p-8 text-center text-charcoal-soft">
            Our shelves are being restocked right now. Please check back soon, or message us on
            WhatsApp and we will let you know when your favourite is available.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
