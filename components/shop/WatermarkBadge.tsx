'use client';

import { cn } from '@/lib/utils';
import { isWatermarkVisible } from '@/lib/watermark';
import { useWatermark } from '@/components/shop/WatermarkProvider';

/**
 * The brand mark drawn over a product image.
 *
 * Placement follows the agreed spec: absolutely positioned 8px in from the bottom-left of the image
 * container, lifted above the image in the stacking order, and inert to the pointer so the card's
 * own link still receives every click.
 *
 * `drop-shadow` rather than `box-shadow`, because the mark is a transparent PNG — a box shadow would
 * draw a grey rectangle around the artwork instead of around its ink. It sits on a white packshot
 * for most products but on coloured backgrounds for the Well 10 shots, so it has to stay legible on
 * both. The inline style also wins over the dark-mode `filter` that `app/globals.css` applies to
 * images inside `.product-media`, which is what keeps the shadow intact at night.
 *
 * Renders nothing — not an empty box, not a broken `<img>` — when the switch is off or no logo has
 * been uploaded. The parent container must be `position: relative`; this element establishes none.
 */
export function WatermarkBadge({ className }: { className?: string }) {
  const watermark = useWatermark();
  if (!isWatermarkVisible(watermark)) return null;

  return (
    /* A plain <img>, not next/image: one small admin-uploaded PNG served straight from the CDN.
       There is nothing for the optimiser to gain and a remote allow-list entry to maintain. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={watermark.logoUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        'pointer-events-none absolute bottom-2 left-2 z-10 h-auto w-auto max-w-[45%] object-contain select-none',
        className
      )}
      style={{
        maxHeight: `${watermark.sizePx}px`,
        filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))',
      }}
      decoding="async"
    />
  );
}
