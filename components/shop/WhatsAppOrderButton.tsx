'use client';

import { MessageCircle } from 'lucide-react';
import { createCartOrderLink } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

/**
 * "Order via WhatsApp" — the no-registration path to buying.
 *
 * Used on the product page (one line, the quantity on screen) and on the cart (every line). Both
 * hand the shopper to a chat with the order already written out, so nothing has to be retyped and
 * no account is needed.
 *
 * The green is WhatsApp's own, hard-coded rather than added to the Tailwind theme: it is a
 * third-party brand colour, not part of the shop's palette, and putting it in the theme would make
 * it available to every other component that should never use it. It is the one place on the site
 * where a colour is chosen because a different company owns it.
 */

const WHATSAPP_GREEN = 'bg-[#25D366] hover:bg-[#1EA855] focus-visible:ring-[#25D366]';

export function WhatsAppOrderButton({
  items,
  totalNpr,
  whatsappNumber,
  deliveryLocation,
  label = 'Order via WhatsApp',
  hint,
  className,
  compact = false,
}: {
  items: Array<{
    name: string;
    variant?: string | null;
    quantity: number;
    line_total_npr: number;
  }>;
  totalNpr: number;
  whatsappNumber: string;
  /** Free text shown as the "Delivery Location" line. Omitted from the message when blank. */
  deliveryLocation?: string | null;
  label?: string;
  /** Small print under the button, e.g. "No account needed". */
  hint?: string;
  className?: string;
  /** A pill for tight spaces instead of a full-width button. */
  compact?: boolean;
}) {
  // Empty-cart fallback: with nothing to order there is no message worth sending, so the control
  // is rendered inert with the reason rather than hidden. A button that silently disappears reads
  // as a bug; a disabled one that explains itself does not.
  const empty = items.length === 0;

  const body = (
    <>
      <MessageCircle className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden="true" />
      {label}
    </>
  );

  const base = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium text-white transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    // Same 44px mobile floor as every other touch target on the site.
    'min-h-[44px] md:min-h-0',
    compact ? 'px-4 text-xs' : 'px-6 text-sm h-12',
    className
  );

  if (empty) {
    return (
      <div className="w-full">
        <span
          aria-disabled="true"
          className={cn(base, 'cursor-not-allowed bg-charcoal/15 text-charcoal-soft')}
        >
          {body}
        </span>
        <p className="mt-2 text-xs text-charcoal-soft">
          Add something to your cart to order on WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <a
        href={createCartOrderLink({
          items,
          total_npr: totalNpr,
          delivery_location: deliveryLocation,
          business_whatsapp: whatsappNumber,
        })}
        target="_blank"
        rel="noopener noreferrer"
        // Tells the OS and assistive tech this leaves the site into another app.
        className={cn(base, WHATSAPP_GREEN)}
      >
        {body}
      </a>
      {hint ? <p className="mt-2 text-center text-xs text-charcoal-soft">{hint}</p> : null}
    </div>
  );
}
