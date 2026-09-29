'use client';

import Link from 'next/link';
import { Award, CalendarCheck, GraduationCap, MapPin, Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { HeroSlideshow } from '@/components/public/HeroSlideshow';
import type { HeroSlide, SalonSettings } from '@/types/database.types';

const TRUST = [
  { icon: Award, value: '12+ years', label: 'Serving Attariya & Kailali' },
  { icon: Sparkles, value: '900+ brides', label: 'Bridal looks delivered' },
  { icon: GraduationCap, value: '300+ graduates', label: 'Trained in our academy' },
];

/** Copy the hero falls back to when the owner has not written their own (migration 0013). */
const DEFAULT_BADGE = 'Mahendranagar Road, Attariya Chowk, Kailali';
const DEFAULT_HEADING = 'Look and feel like the best version of you';
const DEFAULT_SUBHEADING =
  'नमस्ते! From everyday hair and skin care to full bridal transformations — plus a beautician academy for anyone ready to build a career in beauty.';
const DEFAULT_HERO_IMAGE = '/media/placeholder-salon.svg';

/** Only the owner-editable hero fields are needed, so callers can pass the full settings row. */
type HeroSettings = Pick<
  SalonSettings,
  'hero_image_url' | 'hero_heading' | 'hero_subheading' | 'hero_badge_text'
>;

/**
 * Landing-page hero: value proposition, primary booking CTA and a studio image.
 *
 * Headline, sub-copy, badge and photograph all come from `salon_settings` (editable in the admin
 * console); each falls back to the bundled copy/placeholder when the owner has left it blank.
 *
 * The trust strip is rendered as part of the hero block (rather than as one of the configurable
 * landing sections) so the shop section can sit directly beneath the hero.
 */
export function HeroSection({
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
  const heroImage = settings?.hero_image_url?.trim() || DEFAULT_HERO_IMAGE;

  return (
    <>
    <section className="section gradient-warm">
      <div className="container grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-5">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-charcoal-soft shadow-soft dark:bg-white/10">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-gold" aria-hidden="true" />
            <span className="min-w-0 break-words">{badgeText}</span>
          </p>

          <h1 className="font-display text-3xl leading-tight text-charcoal sm:text-4xl lg:text-5xl">
            {heading}
          </h1>

          <p className="max-w-xl text-base text-charcoal-soft sm:text-lg">{subheading}</p>

          <div className="flex flex-wrap gap-3">
            <Link href="/services" className={buttonVariants({ size: 'lg' })}>
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
              Book Appointment
            </Link>
            <Link
              href="#featured-services"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Explore services
            </Link>
          </div>

          <p className="text-sm text-charcoal-soft">
            Walk in or book ahead — either way, your appointment time is yours alone.
          </p>
        </div>

        {/* Multi-image slideshow when the owner has uploaded slides; otherwise the single
            hero image, and failing that the bundled placeholder. */}
        <HeroSlideshow slides={slides} fallbackImage={heroImage} />
      </div>
    </section>

    <section className="section bg-cream-100">
      <div className="container">
        <div className="grid gap-4 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, value, label }) => (
            <div key={value} className="panel flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush-200 text-rose-gold">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl text-charcoal">{value}</p>
                <p className="text-sm text-charcoal-soft">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
    </>
  );
}
