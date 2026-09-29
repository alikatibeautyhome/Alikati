'use client';

import * as React from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';

export const CONSENT_KEY = 'abh-cookie-choice';
export type CookieChoice = 'all' | 'essential';

/**
 * Cookie notice.
 *
 * "Essential only" is a real choice, not decoration: it records the preference and the app
 * never loads analytics-style tracking. Whatever is chosen is stored in localStorage (so the
 * banner stays gone) and mirrored into a first-party cookie (so the choice travels with
 * server-rendered requests too).
 */
export function CookieConsent({
  enabled,
  text,
}: {
  enabled: boolean;
  text?: string | null;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CONSENT_KEY);
    } catch {
      stored = null;
    }
    // Wait a beat so the banner does not flash in before the page settles.
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  function choose(choice: CookieChoice) {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
      document.cookie = `${CONSENT_KEY}=${choice}; max-age=31536000; path=/; samesite=lax`;
    } catch {
      /* Private mode: the choice simply will not persist. */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 animate-slide-up border-t border-charcoal/10 bg-white/95 p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] backdrop-blur sm:p-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Cookie className="hidden h-5 w-5 shrink-0 text-rose-gold sm:block" aria-hidden="true" />

        <p className="flex-1 text-sm text-charcoal-soft">
          {text ??
            'We use cookies to keep your cart working and to understand which products people like.'}{' '}
          <Link href="/privacy" className="font-medium text-rose-gold underline underline-offset-2">
            How we use cookies
          </Link>
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose('essential')}
            className="min-h-11 flex-1 rounded-full border border-charcoal/15 px-4 text-sm font-medium text-charcoal transition-colors hover:bg-charcoal/5 sm:flex-none"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose('all')}
            className="min-h-11 flex-1 rounded-full bg-rose-gold px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 sm:flex-none"
          >
            Accept all
          </button>
        </div>
      </div>
    </aside>
  );
}
