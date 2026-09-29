'use client';

import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'pending' | 'confirmed' | 'progress' | 'completed' | 'revenue';

const TONE_STYLES: Record<StatTone, string> = {
  neutral: 'bg-white',
  pending: 'bg-warn/5',
  confirmed: 'bg-success/5',
  progress: 'bg-rose-gold/5',
  completed: 'bg-charcoal/5',
  revenue: 'bg-blush-100',
};

export interface StatTileProps {
  label: string;
  value: string;
  subLabel?: string;
  tone?: StatTone;
  className?: string;
}

/** KPI tile used across the admin dashboard. Value is pre-formatted by the caller. */
export function StatTile({ label, value, subLabel, tone = 'neutral', className }: StatTileProps) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-charcoal/10 p-3 shadow-soft sm:p-4',
        TONE_STYLES[tone],
        className
      )}
    >
      <p className="eyebrow leading-snug">{label}</p>
      <p
        className="mt-2 truncate font-display text-lg leading-tight text-charcoal sm:text-2xl"
        title={value}
      >
        {value}
      </p>
      {subLabel ? <p className="mt-1 text-xs leading-snug text-charcoal-soft">{subLabel}</p> : null}
    </div>
  );
}
