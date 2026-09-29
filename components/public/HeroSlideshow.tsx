'use client';

import * as React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HeroSlide } from '@/types/database.types';

export interface HeroSlideshowProps {
  /** Active slides in display order. Empty falls back to `fallbackImage`. */
  slides: HeroSlide[];
  /** Single image used when there are no slides (`salon_settings.hero_image_url`). */
  fallbackImage?: string | null;
  /** Bundled placeholder of last resort, so the hero is never blank. */
  placeholder?: string;
  defaultAlt?: string;
  intervalMs?: number;
  /** `priority` on the first image keeps the hero as the LCP rather than a late swap-in. */
  priority?: boolean;
  className?: string;
}

/**
 * Landing-page hero slideshow.
 *
 * Design decisions worth knowing:
 *   • Slides are stacked and cross-faded with opacity rather than mounted/unmounted, so every
 *     image is already decoded when its turn comes — no flash of empty frame mid-rotation.
 *   • Auto-advance stops on hover, on keyboard focus, when the tab is hidden, and entirely when
 *     the visitor prefers reduced motion. Visitors who never interact still see every photo.
 *   • Swipe works on touch; arrows appear from `sm` up; dots are always shown and are 44px tall
 *     so they are comfortable on a phone.
 *   • A single image renders as a plain image with no controls — a carousel of one is noise.
 */
export function HeroSlideshow({
  slides,
  fallbackImage,
  placeholder = '/media/placeholder-salon.svg',
  defaultAlt = 'Alikati Beauty Home in Attariya Chowk, Kailali',
  intervalMs = 5000,
  priority = true,
  className,
}: HeroSlideshowProps) {
  // De-duplicate by image URL: the same photo twice would look like a glitch.
  const items = React.useMemo(() => {
    const seen = new Set<string>();
    return slides.filter((slide) => {
      const url = slide.image_url?.trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [slides]);

  const images = React.useMemo(() => {
    if (items.length > 0) return items.map((slide) => ({ url: slide.image_url, alt: slide.alt_text }));
    const single = (fallbackImage ?? '').trim() || placeholder;
    return [{ url: single, alt: defaultAlt }];
  }, [items, fallbackImage, placeholder, defaultAlt]);

  const count = images.length;
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const touchStartX = React.useRef<number | null>(null);

  // Respect the OS "reduce motion" setting: show the first photo and stop rotating.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const go = React.useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count]
  );

  React.useEffect(() => {
    if (count <= 1 || paused || reducedMotion) return;

    const timer = window.setInterval(() => {
      // Never advance into a background tab — it would burn battery and throw away a slide.
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [count, paused, reducedMotion, intervalMs]);

  // Keep the index valid if the owner removes a slide while someone is looking at the page.
  React.useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null || count <= 1) return;
    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
    // 40px is far enough to be deliberate, short enough to feel responsive.
    if (Math.abs(delta) < 40) return;
    go(index + (delta < 0 ? 1 : -1));
  };

  return (
    <div
      className={cn(
        'relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-charcoal/10 bg-cream-200 shadow-lift lg:aspect-square',
        className
      )}
      role={count > 1 ? 'region' : undefined}
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={count > 1 ? 'Photos of our salon and work' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {images.map((image, position) => (
        <Image
          key={`${image.url}-${position}`}
          src={image.url}
          alt={image.alt?.trim() || defaultAlt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={priority && position === 0}
          aria-hidden={position !== index}
          className={cn(
            'object-cover transition-opacity duration-700 ease-out',
            position === index ? 'opacity-100' : 'opacity-0',
            // Slow drift on the visible frame; skipped entirely for reduced motion.
            position === index && !reducedMotion && count > 1 ? 'animate-hero-pan' : undefined
          )}
        />
      ))}

      {count > 1 && (
        <>
          {/* Legibility scrim behind the controls, so pale photos cannot swallow them. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-charcoal/45 to-transparent"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-charcoal shadow-soft transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold sm:flex"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-charcoal shadow-soft transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold sm:flex"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1">
            {images.map((image, position) => (
              <button
                key={`dot-${image.url}-${position}`}
                type="button"
                onClick={() => go(position)}
                aria-label={`Show photo ${position + 1} of ${count}`}
                aria-current={position === index}
                className="flex h-11 w-9 items-center justify-center focus-visible:outline-none"
              >
                <span
                  className={cn(
                    'block rounded-full transition-all',
                    position === index
                      ? 'h-2.5 w-6 bg-white'
                      : 'h-2.5 w-2.5 bg-white/60 hover:bg-white/85'
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
