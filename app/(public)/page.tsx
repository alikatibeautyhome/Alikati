import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { GraduationCap, HeartHandshake } from 'lucide-react';
import {
  getAcademyCourses,
  getFeaturedServices,
  getGalleryItems,
  getHeroSlides,
  getSalonSettings,
} from '@/lib/api';
import { getFeaturedProducts } from '@/lib/shop-api';
import { getCategoryTiles } from '@/lib/home-api';
import { getApprovedReviews } from '@/lib/reviews-api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { FeatureStrip } from '@/components/home/FeatureStrip';
import { CategoryTiles } from '@/components/home/CategoryTiles';
import { PromoBand } from '@/components/home/PromoBand';
import { BestSellers } from '@/components/home/BestSellers';
import { TrustStrip } from '@/components/home/TrustStrip';
import { ServiceRail } from '@/components/public/ServiceRail';
import { PortfolioGrid } from '@/components/public/PortfolioGrid';
import { ReviewSection } from '@/components/public/ReviewSection';
import { buttonVariants } from '@/components/ui/button';
import { formatNPR } from '@/lib/utils';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: 'Alikati Beauty Home — Salon, Bridal Studio & Academy in Attariya' },
  description:
    'Hair, bridal, nail and skin services plus professional beautician courses at Mahendranagar Road, Attariya Chowk, Kailali. See our price list in NPR and book in a minute.',
};

/**
 * Landing sections the owner can reorder from the admin settings screen.
 *
 * `cta` is recognised so an explicit placement is honoured, but it is deliberately absent from
 * `DEFAULT_ORDER` — when the owner has not chosen a spot the closing call to action simply renders
 * last, after the trust strip.
 */
const HOME_SECTIONS = [
  'products',
  'categories',
  'promo',
  'services',
  'academy',
  'portfolio',
  'reviews',
  'cta',
] as const;
type HomeSectionKey = (typeof HOME_SECTIONS)[number];

/** Order appended for any key the owner's stored order did not mention. */
const DEFAULT_ORDER: readonly HomeSectionKey[] = [
  'products',
  'categories',
  'promo',
  'services',
  'academy',
  'portfolio',
  'reviews',
];

/**
 * Turns whatever is stored in `settings.home_section_order` into a safe render order.
 *
 * Unknown keys are dropped, duplicates are collapsed, and any section the owner forgot is
 * appended in the default order — so a bad settings value can never blank the page.
 */
function resolveSectionOrder(value: string[] | null | undefined): HomeSectionKey[] {
  const known = new Set<string>(HOME_SECTIONS);
  const seen = new Set<HomeSectionKey>();
  const ordered: HomeSectionKey[] = [];

  for (const raw of Array.isArray(value) ? value : []) {
    if (typeof raw !== 'string' || !known.has(raw)) continue;
    const key = raw as HomeSectionKey;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }

  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) ordered.push(key);
  }

  return ordered;
}

export default async function HomePage() {
  const [
    settings,
    heroSlides,
    featured,
    courses,
    featuredProducts,
    gallery,
    categoryTiles,
    reviews,
  ] = await Promise.all([
    getSalonSettings(),
    getHeroSlides(),
    getFeaturedServices(6),
    getAcademyCourses(),
    getFeaturedProducts(8),
    getGalleryItems(),
    getCategoryTiles(),
    // Approved reviews only — the query and the RLS policy both filter on `is_approved`.
    getApprovedReviews(),
  ]);

  const order = resolveSectionOrder(settings.home_section_order);

  // Rendered in-place when the owner puts `cta` in the order, otherwise as the closing band.
  const ctaSection = (
    <section className="section gradient-rose text-white">
      <div className="container text-center">
        <h2 className="font-display text-3xl sm:text-4xl">Ready when you are</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">
          Book online in under a minute, or message us on WhatsApp — whichever is easier for you.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/services" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Book Appointment
          </Link>
          <Link href="/contact" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Visit our studio
          </Link>
        </div>
      </div>
    </section>
  );

  // Local registry: every section the owner can order, keyed by the stored section name.
  const sections: Record<HomeSectionKey, ReactNode> = {
    products: <BestSellers products={featuredProducts} />,

    categories: <CategoryTiles tiles={categoryTiles} />,

    promo: <PromoBand settings={settings} />,

    services: (
      /*
        `hidden md:block`: the full service rail is a long scroll on a phone and pushes the shop —
        the thing a mobile visitor most often came for — well down the page. Services keep their own
        page, reachable from the nav and the footer. Desktop is untouched.
      */
      <section id="featured-services" className="section hidden scroll-mt-20 md:block">
        <div className="container">
          <ServiceRail
            services={featured}
            eyebrow="Most booked"
            heading="Signature services"
            description="नमस्ते! Every price is in Nepali rupees, and any seasonal offer is already applied."
            linkHref="/services"
            linkLabel="View all services"
          />
        </div>
      </section>
    ),

    academy: (
      <section className="section bg-blush-50">
        <div className="container grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="eyebrow">Alikati Academy</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">
              Learn the craft, then build your own chair
            </h2>
            <p className="text-charcoal-soft">
              Hands-on beautician training in small batches, practised on real clients inside our own studio.
            </p>

            <ul className="space-y-3">
              {courses.slice(0, 3).map((course) => (
                <li key={course.id} className="flex items-start gap-3">
                  <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
                  <span className="min-w-0 break-words text-charcoal">
                    <span className="font-medium">{course.title}</span>{' '}
                    <span className="text-charcoal-soft">
                      · {course.duration_weeks} weeks · {formatNPR(course.fee_npr)}
                      {course.is_enrolling ? '' : ' · waitlist'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <Link href="/academy" className={buttonVariants()}>
              Explore the academy
            </Link>
          </div>

          <div className="panel p-8">
            <HeartHandshake className="h-8 w-8 text-rose-gold" aria-hidden="true" />
            <p className="mt-4 font-display text-2xl text-charcoal">
              Small batches, real clients, personal attention.
            </p>
            <p className="mt-2 text-charcoal-soft">
              Every course finishes with a supervised portfolio session, so you leave with proof of your work.
            </p>
          </div>
        </div>
      </section>
    ),

    portfolio: (
      /*
        Hidden below md for the same reason as the service rail: a large image grid a phone visitor
        scrolls past to reach the shop. The portfolio has its own page.
      */
      <section className="section hidden bg-cream-100 md:block">
        <div className="container space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="eyebrow">Our work</p>
              <h2 className="font-display text-3xl text-charcoal sm:text-4xl">Real results from our studio</h2>
              <p className="max-w-xl text-charcoal-soft">
                A glimpse of our bridal, hair, nail and skin work — drag the handle on any before/after
                photo to see the transformation.
              </p>
            </div>
            <Link href="/portfolio" className={buttonVariants({ variant: 'outline' })}>
              View full portfolio
            </Link>
          </div>

          <PortfolioGrid items={gallery.slice(0, 6)} />
        </div>
      </section>
    ),

    reviews: (
      <section className="section">
        <div className="container space-y-8">
          <div className="space-y-2 text-center">
            <p className="eyebrow">In their words</p>
            <h2 className="font-display text-3xl text-charcoal sm:text-4xl">Loved across Kailali</h2>
          </div>
          <ReviewSection reviews={reviews} />
        </div>
      </section>
    ),

    cta: ctaSection,
  };

  const ctaIsOrdered = order.includes('cta');

  return (
    <>
      {/* Always at the top: the gradient hero band, then the overlapping feature strip. */}
      <HeroBanner settings={settings} slides={heroSlides} />
      <FeatureStrip />

      {order.map((key) => (
        <Fragment key={key}>{sections[key]}</Fragment>
      ))}

      {/* Trust strip closes the page, immediately before the final call to action. */}
      <TrustStrip />
      {!ctaIsOrdered && ctaSection}
    </>
  );
}
