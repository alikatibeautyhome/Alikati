'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Power } from 'lucide-react';
import { getSalonSettings } from '@/lib/api-client';

/**
 * A standing reminder in the console while the public site is in maintenance.
 *
 * Maintenance mode has one failure that matters more than any other: forgetting to switch it off.
 * The site sits behind a "we'll be back shortly" screen, customers quietly go elsewhere, and nothing
 * in the console says anything is wrong — the toggle is one card among many on a long settings page.
 * This banner is the counterweight, visible from every admin screen for as long as the site is down.
 *
 * Self-fetching rather than fed from the layout, following LowStockAlert in this same toolbar: the
 * only place that knows the answer is the database, and passing it down would mean the layout
 * fetching settings on behalf of every admin page.
 *
 * Renders nothing at all when the site is up, so it costs one request and no markup in the ordinary
 * case.
 */
export function MaintenanceBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getSalonSettings()
      .then((settings) => {
        if (!cancelled) setActive(Boolean(settings.maintenance_mode));
      })
      .catch(() => {
        // A failed read must not invent a banner. Staying silent is the safer error here: a false
        // alarm would train the owner to ignore the one that matters.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      role="status"
      className="border-b border-warn/30 bg-warn/10 px-4 py-2.5 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium text-charcoal sm:text-sm">
          <Power className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          Maintenance mode is ON — visitors cannot see the shop and new orders are refused.
        </p>
        <Link
          href="/admin/settings"
          className="text-xs font-semibold text-warn underline underline-offset-2 hover:text-charcoal sm:text-sm"
        >
          Switch it off
        </Link>
      </div>
    </div>
  );
}
