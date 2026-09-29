'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicReview } from '@/types/reviews.types';

/** Star row for a single review. `role="img"` so the rating is announced, not just drawn. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'h-4 w-4',
            star <= rating ? 'fill-gold text-gold' : 'fill-none text-charcoal/25'
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Lightweight, dependency-free review carousel: arrows, dots and swipe on touch devices.
 *
 * Every review here is a real, approved row from `public.reviews`. There is no built-in copy:
 * until the owner approves something in /admin/reviews this renders nothing, because the previous
 * version carried six hardcoded quotes with invented five-star ratings.
 */
export function ReviewCarousel({ reviews }: { reviews: PublicReview[] }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (reviews.length === 0) return null;

  // Clamp rather than trust state: the list can shrink between renders (the page is ISR-cached
  // and the owner may have un-approved something), which would otherwise blank the carousel.
  const safeIndex = Math.min(index, reviews.length - 1);

  const go = (next: number) =>
    setIndex(((next % reviews.length) + reviews.length) % reviews.length);

  return (
    <div
      className="space-y-5"
      role="group"
      aria-roledescription="carousel"
      aria-label="Client reviews"
    >
      <div
        className="overflow-hidden"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          if (start === null) return;
          const end = event.changedTouches[0]?.clientX ?? start;
          const delta = end - start;
          if (delta > 40) go(safeIndex - 1);
          else if (delta < -40) go(safeIndex + 1);
        }}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {reviews.map((review) => (
            <figure key={review.id} className="w-full shrink-0 px-1">
              <div className="panel mx-auto max-w-2xl p-6 sm:p-8">
                <Quote className="h-7 w-7 text-rose-gold/60" aria-hidden="true" />
                <blockquote className="mt-3 text-base text-charcoal sm:text-lg">
                  “{review.body}”
                </blockquote>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <figcaption className="text-sm">
                    <span className="font-medium text-charcoal">{review.author_name}</span>
                    {review.service_label ? (
                      <span className="text-charcoal-soft"> · {review.service_label}</span>
                    ) : null}
                  </figcaption>
                  <Stars rating={review.rating} />
                </div>
              </div>
            </figure>
          ))}
        </div>
      </div>

      {/* A single review needs no controls — arrows that cannot move anything just add noise. */}
      {reviews.length > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(safeIndex - 1)}
            aria-label="Previous review"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-white text-charcoal transition-colors hover:border-rose-gold/40 active:bg-blush-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            {reviews.map((review, reviewIndex) => (
              <button
                key={review.id}
                type="button"
                onClick={() => setIndex(reviewIndex)}
                aria-label={`Show review ${reviewIndex + 1} of ${reviews.length}`}
                aria-current={safeIndex === reviewIndex}
                className="flex h-11 items-center justify-center px-1"
              >
                <span
                  className={cn(
                    'block h-2.5 rounded-full transition-all',
                    safeIndex === reviewIndex ? 'w-6 bg-rose-gold' : 'w-2.5 bg-charcoal/20'
                  )}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => go(safeIndex + 1)}
            aria-label="Next review"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-white text-charcoal transition-colors hover:border-rose-gold/40 active:bg-blush-100"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
