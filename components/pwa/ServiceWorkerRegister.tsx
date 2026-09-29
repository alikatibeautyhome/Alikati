'use client';

import * as React from 'react';

/**
 * Registers the service worker — this is what makes the site installable and lets it open
 * when the phone is offline.
 *
 * Production only: a service worker in development fights with Next.js hot reloading and can
 * serve stale pages while you are editing.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* Registration failures are not user-facing: the site works without offline support. */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
