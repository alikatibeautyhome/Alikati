'use client';

import { useState } from 'react';
import { PartyPopper, X } from 'lucide-react';
import type { SalonSettings } from '@/types/database.types';

/** Dismissible festival / promotion banner driven by `salon_settings`. */
export function AnnouncementBanner({ settings }: { settings: SalonSettings }) {
  const [dismissed, setDismissed] = useState(false);

  if (!settings.announcement_active || !settings.announcement_text || dismissed) return null;

  return (
    <div className="gradient-rose relative text-white">
      <div className="container flex items-center justify-center gap-2 px-12 py-2.5 text-center">
        <PartyPopper className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
        <p className="min-w-0 break-words text-xs font-medium sm:text-sm">
          {settings.announcement_text}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss announcement"
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 active:bg-white/25"
      >
        <X className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}
