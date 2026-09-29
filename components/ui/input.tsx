import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // 16px on phones, 14px from `sm` up. iOS Safari auto-zooms the whole page when a focused
        // field is under 16px, and the page stays zoomed afterwards — the classic mobile form bug.
        'flex h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3.5 py-2 text-base text-charcoal sm:text-sm',
        'placeholder:text-charcoal-soft/70 focus-visible:border-rose-gold focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-rose-gold/25 disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
