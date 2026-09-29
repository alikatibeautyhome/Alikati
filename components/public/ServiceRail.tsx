'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ServiceCard } from '@/components/public/ServiceCard';
import type { Service } from '@/types/database.types';

/** Gap between rail cards, matching `.snap-rail` (`gap-4` = 1rem). */
const CARD_GAP_PX = 16;

/**
 * Horizontal, snapping services rail.
 *
 * The rail scrolls inside itself only — it never pushes the page sideways — so it is safe at
 * 360px. Arrow buttons are desktop-only and stay hidden until there is actually something to
 * scroll (measured by comparing `scrollWidth` with `clientWidth`).
 */
export function ServiceRail({
  services,
  onBook,
  eyebrow = 'Most booked',
  heading = 'Signature services',
  description,
  linkHref,
  linkLabel = 'View all services',
  emptyMessage = 'Our catalogue is being updated right now. Please call us and we will help you choose.',
}: {
  services: Service[];
  onBook?: (service: Service) => void;
  eyebrow?: string;
  heading?: string;
  description?: string;
  linkHref?: string;
  linkLabel?: string;
  emptyMessage?: string;
}) {
  const railRef = React.useRef<HTMLUListElement | null>(null);
  const [overflowing, setOverflowing] = React.useState(false);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);

  const sync = React.useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    setOverflowing(maxScroll > 1);
    setAtStart(rail.scrollLeft <= 1);
    setAtEnd(rail.scrollLeft >= maxScroll - 1);
  }, []);

  React.useEffect(() => {
    sync();
    const rail = railRef.current;
    if (!rail) return;

    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    observer?.observe(rail);

    // Images settle after mount and can change the scrollable width.
    const frame = window.requestAnimationFrame(sync);

    return () => {
      rail.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [sync, services.length]);

  function scrollByCard(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    const first = rail.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + CARD_GAP_PX : rail.clientWidth;
    rail.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="font-display text-3xl text-charcoal sm:text-4xl">{heading}</h2>
          {description ? <p className="max-w-xl text-charcoal-soft">{description}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {overflowing ? (
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                disabled={atStart}
                aria-label="Scroll services left"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-white/80 text-charcoal transition-colors hover:border-rose-gold/40 hover:text-rose-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                disabled={atEnd}
                aria-label="Scroll services right"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-white/80 text-charcoal transition-colors hover:border-rose-gold/40 hover:text-rose-gold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {linkHref ? (
            <Link
              href={linkHref}
              className={buttonVariants({ variant: 'outline', className: 'min-h-11 dark:bg-white/10' })}
            >
              {linkLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {services.length === 0 ? (
        <div className="panel p-8 text-center text-charcoal-soft">{emptyMessage}</div>
      ) : (
        <ul
          ref={railRef}
          // `rail-hint` fades the peeking next card on phones. The arrow buttons are desktop-only,
          // so on a phone this fade is the only cue that the row keeps going.
          className="snap-rail rail-hint"
          aria-label="Salon services — a scrollable list, swipe or use the arrows to see more"
        >
          {services.map((service) => (
            <li key={service.id} className="min-w-[78%] sm:min-w-[46%] lg:min-w-[31%]">
              <ServiceCard service={service} onBook={onBook} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
