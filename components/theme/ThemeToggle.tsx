'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';

/**
 * Light/dark switch.
 *
 * Renders a stable placeholder until mounted so server and client markup match — the theme is
 * only knowable in the browser.
 */
export function ThemeToggle({
  className,
  variant = 'icon',
}: {
  className?: string;
  variant?: 'icon' | 'row';
}) {
  const { resolved, toggle } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolved === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          'text-charcoal-soft hover:bg-white/5 hover:text-white',
          className
        )}
      >
        {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-charcoal/10',
        'bg-white/80 text-charcoal transition-colors hover:border-rose-gold hover:text-rose-gold',
        'sm:h-9 sm:w-9',
        className
      )}
    >
      {/* Both icons are always rendered to keep the button width stable; only opacity changes. */}
      <Sun
        className={cn('h-4 w-4 transition-opacity', isDark ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
      <Moon
        className={cn('-ml-4 h-4 w-4 transition-opacity', isDark ? 'opacity-0' : 'opacity-100')}
        aria-hidden="true"
      />
    </button>
  );
}
