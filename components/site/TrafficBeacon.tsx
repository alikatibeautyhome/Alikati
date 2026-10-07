'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CONSENT_EVENT, CONSENT_KEY } from '@/components/site/CookieConsent';

/**
 * Fires one page view per navigation.
 *
 * ── It does nothing until the visitor says it may ────────────────────────────
 * `CookieConsent` documents a promise in its own comment: choose "Essential only" and the app
 * "never loads analytics-style tracking". That promise is only worth anything if the tracking code
 * honours it, so this component's first act is to read the consent key and its second is to stop.
 *
 * The consequence, stated plainly because it shows up in the numbers: these figures count
 * **consenting visitors only**. Anyone who dismissed the banner without choosing — which is most
 * people — is invisible. The console says so on the page itself; the shape of the trend is
 * trustworthy, the absolute totals are a floor.
 *
 * `CONSENT_EVENT` (dispatched by `CookieConsent`) lets the choice take effect on the page the
 * visitor is already looking at, instead of only from the next navigation onwards.
 *
 * ── Why a beacon rather than middleware ──────────────────────────────────────
 * `middleware.ts` matches only `/admin/:path*` and `/login`, so every public page would have to be
 * added to it — putting a database write in the path of every request, including static assets, on
 * a storefront that currently does none. Rendering on the client also means `document.referrer` and
 * the real client-side route are available, which middleware does not have for a soft navigation.
 */

/** Per-tab session id. sessionStorage, so it is gone when the tab closes — not a tracking cookie. */
const SESSION_KEY = 'abh-traffic-session';

function currentSessionId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private mode or storage disabled: count the view without a session rather than not at all.
    // The SQL treats a null session as "cannot contribute to a bounce rate", which is correct.
    return null;
  }
}

function consentGiven(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'all';
  } catch {
    return false;
  }
}

export function TrafficBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    // One view per navigation per mount. Without this the consent listener and the mount would
    // both fire on the page where consent is granted.
    let sent = false;

    function send() {
      if (sent || !consentGiven()) return;
      sent = true;

      const payload = JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        // Sent only so the route can read `?ref=`; the query string itself is never stored.
        search: window.location.search,
        sessionId: currentSessionId(),
      });

      try {
        // `keepalive` so a navigation that starts immediately afterwards does not cancel it.
        void fetch('/api/traffic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {
          /* Nothing to do and nothing to show. A missed page view is not a page failure. */
        });
      } catch {
        /* Same. */
      }
    }

    send();
    window.addEventListener(CONSENT_EVENT, send);
    return () => window.removeEventListener(CONSENT_EVENT, send);
  }, [pathname]);

  return null;
}
