import type { Metadata } from 'next';
import Link from 'next/link';
import { getGalleryItems } from '@/lib/api';
import { PortfolioGrid } from '@/components/public/PortfolioGrid';
import { buttonVariants } from '@/components/ui/button';

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: 'Bridal Makeup Studio in Attariya | Alikati Beauty Home' },
  description:
    'Book certified bridal makeup artists in Attariya Chowk, Kailali. Long-lasting bridal, reception, and engagement makeovers tailored to traditional Nepali brides.',
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
              Signature Bridal Makeup &amp; Wedding Makeovers in Attariya Chowk
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
            {/*
              `rel="nofollow"` was removed here. It was on an internal link, which tells Google not
              to follow — and not to pass any signal from — a page on your own site. Nofollow is for
              links you do not vouch for, not for routes you want crawled.
            */}
            <p className="text-charcoal-soft">
              Like what you see? See{' '}
              <Link href="/services" className="text-rose-gold underline-offset-2 hover:underline">
                our bridal packages in Attariya
              </Link>{' '}
              for what each one includes, or book a consultation.
            </p>
            <Link href="/services" className={buttonVariants({ size: 'lg' })}>
              Book an appointment
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
