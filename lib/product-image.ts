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
 */
export function productImageSrc(
  rawUrl: string | null | undefined,
  fallback = '/media/placeholder-product.svg'
): string {
  if (!rawUrl) return fallback;
  if (rawUrl.startsWith('/')) return rawUrl;
  return `${ENDPOINT}${encodeURIComponent(rawUrl)}`;
}

/** The processed image as an absolute path, for `og:image` and other metadata. */
export function productImageSrcAbsolute(
  rawUrl: string | null | undefined,
  format: 'webp' | 'png' | 'jpeg' = 'png'
): string {
  const base = productImageSrc(rawUrl, '/media/og-image.png');
  return base.includes('?') ? `${base}&format=${format}` : base;
}
