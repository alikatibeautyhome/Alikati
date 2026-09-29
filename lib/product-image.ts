/**
 * The one place that decides which URL a product image is rendered from.
 *
 * Every product photograph on the site is served through `/api/product-image`, which puts it on a
 * white canvas, removes the supplier's watermark and stamps the salon's mark — see that route for
 * the geometry.
 *
 * Routing through here rather than pointing at the supplier's URL directly is what makes a NEW
 * product work with no extra step: whatever image URL someone pastes into the console, the next
 * render passes it through the same pipeline. There is no per-product setup and no batch job to
 * remember to run.
 *
 * Used by the storefront, the cart, order confirmation and the admin tables alike, so a thumbnail
 * and a hero shot can never disagree about what the product's image is.
 */

const ENDPOINT = '/api/product-image?src=';

/**
 * Wraps a stored image URL in the processing endpoint.
 *
 * Already-local paths (`/media/…`, `/brand/…`) are returned untouched — they are our own assets and
 * have nothing to clean. A missing URL returns the fallback so callers never render a broken image.
 *
 * `stripWatermark: false` keeps the white canvas and the salon's mark but skips the supplier-mark
 * boxes. Those boxes were measured against one supplier's packshots; a different supplier's photos
 * carry no mark, so painting the boxes there only erases real product content. Sources known to be
 * mark-free (the Well 10 range) opt out this way instead of editing the shared geometry.
 *
 * `brandMark: false` skips the salon's own mark. Used only where the badge is drawn in the DOM
 * instead — see `components/shop/WatermarkBadge.tsx` — because the mark is baked into the pixels and
 * an overlay on top of it would render twice. Surfaces without an overlay (link previews, order
 * confirmations, WhatsApp messages, the admin console) keep the baked mark.
 */
export function productImageSrc(
  rawUrl: string | null | undefined,
  fallback = '/media/placeholder-product.svg',
  options: { stripWatermark?: boolean; brandMark?: boolean } = {}
): string {
  if (!rawUrl) return fallback;
  if (rawUrl.startsWith('/')) return rawUrl;

  // Appended rather than rebuilt with URLSearchParams: every existing call site already depends on
  // `encodeURIComponent`'s exact output, and switching encoder would change the URL (and therefore
  // the cache key) of every product image on the site for no benefit.
  const base = `${ENDPOINT}${encodeURIComponent(rawUrl)}`;
  const flags: string[] = [];
  if (options.stripWatermark === false) flags.push('strip=off');
  if (options.brandMark === false) flags.push('mark=off');
  return flags.length > 0 ? `${base}&${flags.join('&')}` : base;
}

/** The processed image as an absolute path, for `og:image` and other metadata. */
export function productImageSrcAbsolute(
  rawUrl: string | null | undefined,
  format: 'webp' | 'png' | 'jpeg' = 'png'
): string {
  const base = productImageSrc(rawUrl, '/media/og-image.png');
  return base.includes('?') ? `${base}&format=${format}` : base;
}
