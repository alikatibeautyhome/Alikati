import { BadgeCheck, RotateCcw, Sparkles, Truck } from 'lucide-react';

/**
 * Static UI copy for the feature strip. Written for Alikati Beauty Home specifically — genuine
 * stock, salon-tested, local delivery, easy returns — rather than the reference storefront's
 * generic wording.
 */
const FEATURES = [
  {
    icon: BadgeCheck,
    title: '100% Original',
    subtitle: 'Genuine brands only, from authorised suppliers.',
  },
  {
    icon: Sparkles,
    title: 'Stylist-Tested',
    subtitle: 'Tried by our own salon team before it reaches you.',
  },
  {
    icon: Truck,
    title: 'Fast Delivery',
    subtitle: 'Same-day drop-off across Attariya & Kailali.',
  },
  {
    icon: RotateCcw,
    title: 'Easy Returns',
    subtitle: 'Unopened item? Swap or return within 7 days.',
  },
] as const;

/**
 * The white card row that overlaps the bottom edge of the hero band.
 *
 * Rendered as its own section with a negative top margin so it straddles the gradient and the
 * page background — the reference's signature overlap. Two columns on phones, four from `sm`.
 */
export function FeatureStrip() {
  return (
    <section className="relative z-10 -mt-16 sm:-mt-20">
      <div className="container">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-lift sm:gap-6 sm:p-7 md:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, subtitle }) => (
            // Phones: icon above the text so the description gets the full column width instead of
            // the ~105px left over beside a 44px icon. That leftover was what made the copy wrap
            // into an unreadable five-line column on a 390px screen. From `sm` up, side by side.
            <div key={title} className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush-200 text-rose-gold sm:h-11 sm:w-11">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm text-charcoal sm:text-base">{title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-charcoal-soft sm:text-sm">
                  {subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
