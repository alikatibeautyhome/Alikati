import { ShieldCheck, Gift, MessageCircle, Crown } from 'lucide-react';

/**
 * Static UI copy for the trust strip near the foot of the page — secure checkout, festival
 * offers, the WhatsApp line our customers actually use, and the loyalty programme.
 */
const TRUST = [
  {
    icon: ShieldCheck,
    title: 'Secure Payments',
    subtitle: 'eSewa, Khalti, bank transfer or cash on delivery.',
  },
  {
    icon: Gift,
    title: 'Festival Offers',
    subtitle: 'Dashain–Tihar bundles and bridal-season deals.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Support',
    subtitle: 'Message us daily, 8am–8pm Nepal time.',
  },
  {
    icon: Crown,
    title: 'Loyalty Rewards',
    subtitle: 'Earn points on every order and salon visit.',
  },
] as const;

/**
 * Trust strip — the reference's four-assurance row, rendered just before the final call to action.
 * Two columns on phones, four from `sm`.
 */
export function TrustStrip() {
  return (
    <section className="section bg-cream-100">
      <div className="container">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-soft sm:gap-6 sm:p-7 md:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, subtitle }) => (
            // Same mobile treatment as the feature strip: icon on top, description full width.
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
