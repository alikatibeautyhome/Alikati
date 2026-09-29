import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        'bg-charcoal/5 text-charcoal ring-charcoal/10',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Status chip used by the appointment and lead tables. */
export function StatusBadge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
