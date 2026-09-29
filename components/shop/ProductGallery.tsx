'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { productImageSrc } from '@/lib/product-image';
import { WatermarkBadge } from '@/components/shop/WatermarkBadge';

/**
 * The product page's image gallery: one large viewport with a zoom-on-hover, and a thumbnail strip
 * for the other angles.
 *
 * A client component because the active frame is interactive state. The page around it stays a
 * server component, and the primary image keeps `priority` so it remains the LCP element.
 *
 * Three ways to change frame, because one of them is not enough on its own: click a thumbnail,
 * swipe the viewport (the only option on a touch screen when there are no visible controls), or —
 * on the grid — hover. `next/image` is asked for each thumbnail at 80px, so the strip costs a few
 * kilobytes rather than a second copy of every full-size photo.
 *
 * The baked brand mark is suppressed here when the DOM badge is active, exactly as on the cards:
 * see `WatermarkBadge` and `productImageSrc`'s `brandMark` option. Thumbnails always skip it — at
 * 80px a logo would be noise rather than branding.
 */
export function ProductGallery({
  images,
  name,
  brandMarkSuppressed,
  children,
}: {
  /** Ordered gallery; index 0 is the primary image. */
  images: string[];
  name: string;
  /** True when a DOM badge is drawn, so the baked mark must be left out of the image. */
  brandMarkSuppressed: boolean;
  /** Extra overlays for the viewport — the discount flag lives here. */
  children?: React.ReactNode;
}) {
  const gallery = React.useMemo(() => {
    const list = (images ?? []).map((url) => (url ?? '').trim()).filter(Boolean);
    return [...new Set(list)];
  }, [images]);

  const [active, setActive] = React.useState(0);
  const shown = gallery.length > 0 ? active % gallery.length : 0;
  const current = gallery[shown] ?? null;

  const touchStartX = React.useRef<number | null>(null);

  function step(delta: number) {
    if (gallery.length < 2) return;
    setActive((value) => (value + delta + gallery.length) % gallery.length);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* ── Viewport ─────────────────────────────────────────────────────────── */}
      <div className="order-1 lg:order-2 lg:min-w-0 lg:flex-1">
        <div
          className="product-media group relative aspect-square w-full overflow-hidden rounded-2xl border border-charcoal/10 bg-[#ffffff]"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start === null || gallery.length < 2) return;
            const end = event.changedTouches[0]?.clientX ?? start;
            const dx = end - start;
            // A short drag is a scroll or a tap, not a swipe.
            if (Math.abs(dx) < 40) return;
            step(dx < 0 ? 1 : -1);
          }}
        >
          {/* Scaling wrapper, so the zoom is one transform rather than one per frame. */}
          <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105">
            {current ? (
              <Image
                key={current}
                src={productImageSrc(current, undefined, { brandMark: !brandMarkSuppressed })}
                alt={name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
              />
            ) : (
              /* No photograph at all: a plain tile rather than a broken <img>. */
              <div className="flex h-full w-full items-center justify-center bg-[#ffffff] text-xs text-charcoal-soft">
                No photo yet
              </div>
            )}
          </div>

          {/* Grounding shadow, over the photo — see ProductCard for why it cannot sit behind it. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[14%] bottom-[6%] h-[9%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(30,27,28,0.20),rgba(30,27,28,0)_72%)] blur-[6px]"
          />

          {children}

          <WatermarkBadge />

          {gallery.length > 1 ? (
            <>
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/75 px-2 py-0.5 text-[11px] font-semibold text-charcoal backdrop-blur-sm">
                {shown + 1} / {gallery.length}
              </span>

              {/* On phones the strip below may be off-screen; these keep the angles reachable. */}
              <div className="absolute inset-y-0 left-0 flex items-center pl-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous image"
                  className="rounded-full bg-white/80 p-2 text-charcoal shadow-soft backdrop-blur-sm transition-colors hover:bg-white"
                >
                  <span aria-hidden="true">‹</span>
                </button>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 lg:hidden">
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next image"
                  className="rounded-full bg-white/80 p-2 text-charcoal shadow-soft backdrop-blur-sm transition-colors hover:bg-white"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Thumbnails: below on phones, beside on desktop ───────────────────── */}
      {gallery.length > 1 ? (
        <div className="order-2 lg:order-1 lg:w-20 lg:shrink-0">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {gallery.map((url, index) => (
              <li key={`${url}-${index}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Show image ${index + 1} of ${gallery.length}`}
                  aria-current={index === shown}
                  className={cn(
                    'relative block h-16 w-16 overflow-hidden rounded-xl border bg-[#ffffff] transition-colors lg:h-20 lg:w-20',
                    index === shown
                      ? 'border-rose-gold ring-1 ring-rose-gold/30'
                      : 'border-charcoal/10 hover:border-charcoal/30'
                  )}
                >
                  <Image
                    src={productImageSrc(url, undefined, { brandMark: false })}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="80px"
                    className="object-contain p-1"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
