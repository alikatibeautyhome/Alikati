import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        // 16px on phones to stop iOS Safari zooming the page on focus; 14px from `sm` up.
        'flex w-full rounded-xl border border-charcoal/15 bg-white px-3.5 py-2.5 text-base text-charcoal sm:text-sm',
        'placeholder:text-charcoal-soft/70 focus-visible:border-rose-gold focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-rose-gold/25 disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-danger',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
