'use client';

import { cn } from '@/lib/utils';
import { isWatermarkVisible } from '@/lib/watermark';
import { useWatermark } from '@/components/shop/WatermarkProvider';

/**
 * The brand mark drawn over a product image.
 *
 * **Placement is anchored to the image's white margin, not to a fixed 8px inset.** Every product photo
 * is now framed by `frameProductSquare` with roughly 11.5% of its height left clear around the
 * product. Sizing the badge as a *share of the container* — `min(<configured>px, 8%)` — and insetting it
 * by 1.5% keeps it inside that clear band at every card size. Both numbers must stay under the frame's
 * margin fraction, or the badge starts landing on the product again; that is the whole reason they are
 * percentages rather than pixels. The configured pixel size still applies as a maximum, so a large card
 * on a big screen is not capped unnecessarily.
 *
 * It is lifted above the image in the stacking order but inert to the pointer, so the card's own link
 * still receives every click.
 *
 * `drop-shadow` rather than `box-shadow`, because the mark is a transparent PNG — a box shadow would
 * draw a grey rectangle around the artwork instead of around its ink. The inline style also wins over
 * the dark-mode `filter` that `app/globals.css` applies to images inside `.product-media`, which is
 * what keeps the shadow intact at night.
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
        'pointer-events-none absolute bottom-[1.5%] left-[1.5%] z-10 h-auto w-auto object-contain select-none',
        className
      )}
      style={{
        /*
          Capped as a share of the container, not just in pixels. The frame reserves about 11.5% of its
          height as white margin; 1.5% inset + 8% mark = 9.5%, which stays inside it at every card size.
          A pixel-only cap would overflow that band on a narrow card and put the mark back on the product.
        */
        maxHeight: `min(${watermark.sizePx}px, 8%)`,
        maxWidth: '8%',
        filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))',
      }}
      decoding="async"
    />
  );
}
