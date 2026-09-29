import Link from 'next/link';
import { ArrowRight, BadgeCheck, MapPin } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HeroSlideshow } from '@/components/public/HeroSlideshow';
import type { HeroSlide, SalonSettings } from '@/types/database.types';

/**
 * Copy the hero falls back to when the owner has not written their own (migration 0013).
 * Kept in sync with the original hero so the band reads identically when settings are blank.
 */
const DEFAULT_BADGE = 'Mahendranagar Road, Attariya Chowk, Kailali';
const DEFAULT_HEADING = 'Look and feel like the best version of you';
const DEFAULT_SUBHEADING =
  'नमस्ते! From everyday hair and skin care to full bridal transformations — plus a beautician academy for anyone ready to build a career in beauty.';

/** Only the owner-editable hero fields are needed, so callers can pass the full settings row. */
type HeroSettings = Pick<
  SalonSettings,
  'hero_image_url' | 'hero_heading' | 'hero_subheading' | 'hero_badge_text'
>;

/**
 * Landing-page hero band — the reference design's magenta→pink gradient sweep.
 *
 * This is a *blend*, not a replacement: the settings-driven badge/heading/subheading and the
 * finished `HeroSlideshow` are the originals, now framed in the reference's band with a pill
 * badge, two calls to action and the circular "100% Original" seal overlapping the photo.
 *
 * A Server Component: the only interactive piece is the slideshow it hands off to.
 */
export function HeroBanner({
  settings,
  slides = [],
}: {
  settings?: HeroSettings | null;
  /** Active hero slideshow images (migration 0014). Empty falls back to the single image. */
  slides?: HeroSlide[];
}) {
  const badgeText = settings?.hero_badge_text?.trim() || DEFAULT_BADGE;
  const heading = settings?.hero_heading?.trim() || DEFAULT_HEADING;
  const subheading = settings?.hero_subheading?.trim() || DEFAULT_SUBHEADING;
  const heroImage = settings?.hero_image_url?.trim() || undefined;

  return (
    <section className="gradient-hero relative overflow-hidden pb-28 pt-10 text-white sm:pb-36 sm:pt-16">
      <div className="container grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        {/* ── Copy column ─────────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/30 backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{badgeText}</span>
          </p>

          <h1 className="break-words font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            {heading}
          </h1>

          <p className="max-w-xl break-words text-base text-white/90 sm:text-lg">{subheading}</p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/shop"
              className={buttonVariants({ size: 'lg' })}
            >
              Shop Now
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            {/* `cn` (tailwind-merge) is essential here, not decoration: `buttonVariants` joins
                classes without merging, so passing the colours as cva's `className` left the
                default variant's `bg-rose-gold text-white` in place. Both were emitted, the
                stylesheet's order decided, and the loser was this button — the owner's screenshot
                showed an empty pill. In light mode it was white text on a white pill (the old
                `bg-white text-rose-600` lost its text colour the same way); in dark mode
                `bg-white` is remapped to the dark surface. Merging drops the conflicting defaults,
                and literal hex values keep the colours identical in both themes — the hero
                gradient is magenta either way. */}
            <Link
              href="#shop-categories"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'bg-[#ffffff] text-[#b81a5c] shadow-soft hover:bg-[#ffeef5]'
              )}
            >
              Explore Categories
            </Link>
          </div>
        </div>

        {/* ── Photo column: the original slideshow, with the reference's seal ──── */}
        <div className="relative min-w-0">
          <HeroSlideshow
            slides={slides}
            fallbackImage={heroImage}
            className="border-white/30 shadow-lift"
          />

          <span className="absolute -bottom-4 left-3 z-10 flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-full bg-white text-center shadow-lift ring-4 ring-white/50 sm:-left-5 sm:bottom-6 sm:h-24 sm:w-24">
            <BadgeCheck className="h-5 w-5 text-rose-gold" aria-hidden="true" />
            <span className="px-1 text-[11px] font-semibold leading-tight text-charcoal">
              100% Original
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
