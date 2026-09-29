import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import type { SalonSettings } from '@/types/database.types';

type PromoSettings = Pick<
  SalonSettings,
  'promo_enabled' | 'promo_eyebrow' | 'promo_headline' | 'promo_subheadline' | 'promo_cta_label' | 'promo_href'
>;

/**
 * Full-width promotional band (the reference's "Up to 30% OFF" strip).
 *
 * Every word is the owner's own: if `promo_enabled` is false the band is not rendered at all, and
 * if it is on but the owner left the copy blank there is nothing to show either. We never state a
 * discount, percentage or deadline the owner did not write.
 */
export function PromoBand({ settings }: { settings?: PromoSettings | null }) {
  if (!settings?.promo_enabled) return null;

  const eyebrow = settings.promo_eyebrow?.trim();
  const headline = settings.promo_headline?.trim();
  const subheadline = settings.promo_subheadline?.trim();
  const ctaLabel = settings.promo_cta_label?.trim();
  const href = settings.promo_href?.trim() || '/shop';

  if (!eyebrow && !headline && !subheadline && !ctaLabel) return null;

  return (
    <section className="gradient-sale text-white">
      <div className="container py-12 text-center sm:py-16">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            {eyebrow}
          </p>
        )}

        {headline && (
          <h2 className="mt-3 break-words font-display text-2xl leading-tight sm:text-4xl">
            {headline}
          </h2>
        )}

        {subheadline && (
          <p className="mx-auto mt-3 max-w-2xl break-words text-white/90">{subheadline}</p>
        )}

        {ctaLabel && (
          <Link
            href={href}
            className={buttonVariants({
              size: 'lg',
              className: 'mt-7 bg-white text-rose-600 shadow-soft hover:bg-white/90',
            })}
          >
            {ctaLabel}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
