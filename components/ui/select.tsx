import * as React from 'react';
import { cn } from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Native select, styled to match the other inputs (best behaviour on Android/4G). */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // 16px on phones to stop iOS Safari zooming the page on focus; 14px from `sm` up.
        'flex h-11 w-full appearance-none rounded-xl border border-charcoal/15 bg-white px-3.5 pr-9 text-base text-charcoal sm:text-sm',
        'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236E6668%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat',
        'focus-visible:border-rose-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
