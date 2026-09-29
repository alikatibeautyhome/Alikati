import type { Metadata } from 'next';
import Link from 'next/link';
import { Info, Link2, PauseCircle, Wallet } from 'lucide-react';
import { getSalonSettings } from '@/lib/api';
import { AffiliateJoinForm } from '@/components/affiliate/AffiliateJoinForm';
import { formatNPR } from '@/lib/utils';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Affiliate Programme',
  description:
    'Earn commission by sharing Alikati Beauty Home with friends across Kailali. Apply for your own referral code — no fee, reviewed by the salon.',
  alternates: { canonical: '/affiliate' },
};

const EXAMPLE_ORDER_NPR = 4000;

export default async function AffiliatePage() {
  const settings = await getSalonSettings();

  const rate = Number(settings.affiliate_commission_rate ?? 0);
  const exampleEarning = Math.round((EXAMPLE_ORDER_NPR * rate) / 100);
  const rateLabel = Number.isInteger(rate) ? String(rate) : rate.toFixed(1);

  return (
    <section className="section">
      <div className="container max-w-4xl">
        <header className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="eyebrow">Affiliates</p>
          <h1 className="font-display text-3xl text-charcoal sm:text-4xl">
            Share Alikati, earn a little back
          </h1>
          <p className="text-charcoal-soft">
            Recommend our salon, studio and shop to friends and family. When someone orders through
            your personal link, you earn a commission on their order.
          </p>
        </header>

        {!settings.affiliate_enabled ? (
          <div className="panel mx-auto mt-10 max-w-xl p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
              <PauseCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl text-charcoal">
              The affiliate programme is paused
            </h2>
            <p className="mt-2 text-sm text-charcoal-soft">
              We are not taking new affiliate applications at the moment. Please check back soon, or{' '}
              <Link href="/contact" className="text-rose-gold underline underline-offset-2">
                contact us
              </Link>{' '}
              and we will let you know when it reopens.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
            <div className="space-y-6">
              <div className="panel space-y-4 p-6">
                <h2 className="font-display text-xl text-charcoal">How it works</h2>
                <ul className="space-y-4 text-sm text-charcoal-soft">
                  <li className="flex items-start gap-3">
                    <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
                    <span>
                      Apply below. Once the salon approves you, we hand you a referral link such as{' '}
                      <code className="break-all rounded bg-blush-50 px-1.5 py-0.5 text-charcoal">
                        /?ref=YOUR-CODE
                      </code>
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
                    <span>
                      Share it on WhatsApp, Facebook or TikTok. When a visitor orders with your link,
                      the order is attributed to your code for 60 days.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
                    <span>
                      You earn <strong className="text-charcoal">{rateLabel}%</strong> of the product
                      subtotal. Commissions are paid out by the salon once they reach the payout
                      threshold.
                    </span>
                  </li>
                </ul>

                <div className="rounded-xl bg-blush-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-gold">
                    Worked example
                  </p>
                  <p className="mt-2 text-sm text-charcoal">
                    A {formatNPR(EXAMPLE_ORDER_NPR)} order earns you{' '}
                    <span className="font-display text-lg text-price">
                      {formatNPR(exampleEarning)}
                    </span>{' '}
                    at {rateLabel}%.
                  </p>
                  <p className="mt-1 text-xs text-charcoal-soft">
                    Commission is calculated on the product subtotal, before delivery.
                  </p>
                </div>
              </div>

              {settings.affiliate_terms ? (
                <div className="panel space-y-2 p-6">
                  <h2 className="font-display text-xl text-charcoal">Programme terms</h2>
                  <p className="whitespace-pre-line text-sm text-charcoal-soft">
                    {settings.affiliate_terms}
                  </p>
                </div>
              ) : null}

              <p className="text-sm text-charcoal-soft">
                Want the detail on how referral links are tracked and stored? Read our{' '}
                <Link href="/privacy" className="text-rose-gold underline underline-offset-2">
                  Privacy &amp; cookies
                </Link>{' '}
                page.
              </p>
            </div>

            <AffiliateJoinForm />
          </div>
        )}
      </div>
    </section>
  );
}
