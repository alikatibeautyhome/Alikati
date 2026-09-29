import type { Metadata } from 'next';
import Link from 'next/link';
import { getGalleryItems } from '@/lib/api';
import { PortfolioGrid } from '@/components/public/PortfolioGrid';
import { buttonVariants } from '@/components/ui/button';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Portfolio & Before-After Gallery',
  description:
    'Real bridal, hair, nail and skin results from Alikati Beauty Home in Attariya Chowk, Kailali. Slide to compare before and after, then book your own look.',
};

export default async function PortfolioPage() {
  const items = await getGalleryItems();

  return (
    <>
      <section className="section gradient-warm">
        <div className="container">
          <header className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="eyebrow">Our work</p>
            <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
              Real results from our studio
            </h1>
            <p className="text-charcoal-soft">
              A small selection of bridal, hair, nail and skin work. Where a before photo exists, drag the
              handle to see the transformation.
            </p>
          </header>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <PortfolioGrid items={items} />

          <div className="mt-12 text-center">
            <p className="text-charcoal-soft">Like what you see? Let us plan your look.</p>
            <Link href="/services" className={buttonVariants({ size: 'lg' })} rel="nofollow">
              Book an appointment
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
