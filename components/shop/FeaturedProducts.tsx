import Link from 'next/link';
import { ProductCard } from '@/components/shop/ProductCard';
import { buttonVariants } from '@/components/ui/button';
import type { Product } from '@/types/commerce.types';

/**
 * Presentational strip of featured products for the landing page. Server-renderable — the cards
 * themselves are the only interactive pieces.
 */
export function FeaturedProducts({
  products,
  eyebrow = 'Shop',
  // The landing page leads with the shop, so the heading says what it is.
  heading = 'Shop the products we use',
  description = 'Salon-grade skincare, makeup and hair care — the same products our stylists use. Prices in NPR, delivery across Kailali.',
}: {
  products: Product[];
  eyebrow?: string;
  heading?: string;
  description?: string;
}) {
  return (
    <section className="section bg-cream-100">
      <div className="container">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">{heading}</h2>
            <p className="max-w-xl text-charcoal-soft">{description}</p>
          </div>
          <Link href="/shop" className={buttonVariants({ variant: 'outline' })}>
            Shop all products
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="panel mt-8 p-8 text-center text-charcoal-soft">
            Our shelves are being restocked right now. Please check back soon, or message us on
            WhatsApp and we will let you know when your favourite is available.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
