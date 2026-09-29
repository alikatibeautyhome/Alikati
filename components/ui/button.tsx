import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] ' +
    /*
      A 44px minimum touch target on phones only.

      The size variants below are deliberately compact for desktop density — `sm` is 32px tall and
      `md` is 40px, both under the 44px that a fingertip needs. `min-height` beats `height`, so the
      floor applies on small screens and `md:min-h-0` hands the height back to the size variant from
      768px up, which leaves the desktop layout exactly as it was.
    */
    'min-h-[44px] md:min-h-0',
  {
    variants: {
      variant: {
        default: 'bg-rose-gold text-white shadow-soft hover:bg-rose-600',
        secondary: 'bg-blush-200 text-charcoal hover:bg-blush-300',
        outline: 'border border-charcoal/15 bg-white/70 text-charcoal hover:border-rose-gold/40 hover:bg-white',
        ghost: 'text-charcoal hover:bg-charcoal/5',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        success: 'bg-success text-white hover:bg-success/90',
        link: 'text-rose-gold underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-5 text-sm',
        lg: 'h-12 px-7 text-base',
        // Icon-only buttons need the 44px floor on the width as well — the base rule only sets a
        // minimum height, and `w-9` is 36px across.
        icon: 'h-9 w-9 min-w-[44px] md:min-w-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
