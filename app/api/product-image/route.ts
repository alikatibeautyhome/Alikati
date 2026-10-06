import { NextResponse, type NextRequest } from 'next/server';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
// sharp declares its types as `export = sharp` with a namespace, so the composite layer type is
// reachable through a type-only namespace import but not through the default import binding.
import type * as Sharp from 'sharp';
import { cleanProductBackground, frameProductSquare } from '@/lib/images/background';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';

/**
 * Product-image pipeline.
 *
 * Every product photograph is served through this route so that it is, automatically:
 *
 *   1. **on a white canvas** — a transparent or non-square source is flattened onto white, so a new
 *      product uploaded as a cut-out PNG arrives on the page already looking like a catalogue shot;
 *   2. **free of the supplier's watermark** — the imported catalogue's photographs carry the
 *      supplier's own logo in the top-right and a second mark in the bottom-left. Both are painted
 *      out with white (invisible against these images' white backgrounds);
 *   3. **stamped with the salon's mark**, bottom-left, sized to match the owner's approved sample.
 *
 * Doing this at request time rather than as a one-off batch is what makes "add a new product and it
 * happens by itself" true: whatever URL is pasted into the console goes through the same path on its
 * first render. There is no queue of images to re-export and nothing to remember after an import.
 *
 * The trade-off is a first-request cost — the source is fetched and re-encoded once, then cached
 * (see CACHE below). Steady-state traffic is served from cache.
 *
 * ── Why the geometry is expressed as fractions, not pixels
 * The measurements below come from reading all 169 catalogue images pixel by pixel: the supplier's
 * top mark occupies x 68–96%, y 4–12%, and the bottom-left mark x 0–30%, y 86–100%. The boxes here
 * add a margin on every side, because a mark that is partly painted out looks like a rendering fault
 * while a slightly generous white box on a white background is invisible. Fractions keep that true
 * whatever resolution a new image arrives at.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The most expensive endpoint the public can reach: every call makes an outbound HTTP request and
 * runs the image through sharp on the server's CPU, and it was the only public route with no limit
 * at all.
 *
 * The ceiling is deliberately high — one catalogue page legitimately asks for twenty images, and a
 * shop grid asks for more — so this is not a per-page budget. It exists to stop a loop, not to ration
 * browsing. Over the limit the request is refused rather than served, because serving it is exactly
 * the CPU exhaustion being guarded against.
 */
const rateLimited = createRateLimiter({
  bucket: 'images',
  limit: Number(process.env.IMAGE_RATE_LIMIT_PER_MIN ?? 300),
});

/**
 * The salon's mark, as a fraction of the finished canvas — sized and placed to sit **inside the white
 * margin** that `frameProductSquare` guarantees.
 *
 * It used to be positioned as a fraction of the *product* frame, which meant it landed on the product
 * whenever the product reached the lower-left. It is now anchored to the canvas edge instead, so the
 * margin — not luck — is what keeps it clear of the artwork. `BRAND_MARK_SIZE` plus
 * `BRAND_MARK_INSET` must stay below the frame's margin fraction (about 11.5% of the canvas) for that
 * guarantee to hold.
 */
const BRAND_MARK_SIZE = 0.08;
const BRAND_MARK_INSET = 0.015;

/** `PRODUCT_IMAGE_STRIP_WATERMARK=off` disables step 2 without a code change. */
const STRIP_WATERMARK = (process.env.PRODUCT_IMAGE_STRIP_WATERMARK ?? 'on').toLowerCase() !== 'off';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 4000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const CACHE_SECONDS = 60 * 60 * 24 * 7;

const PRIVATE_IP =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

const hostDecisions = new Map<string, boolean>();
const logoCache = new Map<number, Buffer | null>();

/**
 * Blocks server-side request forgery: only https, and only hosts that resolve to public addresses.
 *
 * An allow-list of known suppliers would have been stricter, but it would also mean that a new
 * product from a new supplier silently loses its image. Resolving instead keeps any https host
 * working while refusing to fetch anything internal.
 */
async function isSafeHost(hostname: string): Promise<boolean> {
  const cached = hostDecisions.get(hostname);
  if (cached !== undefined) return cached;

  let ok = false;
  try {
    if (isIP(hostname)) {
      ok = !PRIVATE_IP.test(hostname);
    } else {
      const addresses = await dns.lookup(hostname, { all: true });
      ok = addresses.length > 0 && addresses.every((a) => !PRIVATE_IP.test(a.address));
    }
  } catch {
    ok = false;
  }

  hostDecisions.set(hostname, ok);
  return ok;
}

/**
 * The salon's mark, resized to the width this image needs and cached across requests.
 *
 * Returns `null` rather than throwing when the file cannot be read, and that matters more than it
 * looks: this route is the image pipeline for the entire shop, so an exception here would turn one
 * missing asset into a site with no product photography at all. A watermark is decoration — if it
 * cannot be applied, the right answer is an image without it, not a broken image.
 *
 * The file *is* present in the serverless bundle: Next traces the `fs.readFile` and lists
 * `public/brand/abh-logo.png` in this route's `.nft.json` manifest, so it works on Vercel. This guard
 * covers everything that manifest cannot promise — a refactor that breaks the trace, a corrupted
 * file, a build made without the asset.
 */
async function brandMark(width: number): Promise<Buffer | null> {
  const key = Math.round(width);
  const cached = logoCache.get(key);
  // `!== undefined` rather than truthiness, so a cached *absence* is honoured instead of retried.
  if (cached !== undefined) return cached;

  try {
    const file = path.join(process.cwd(), 'public', 'brand', 'abh-logo.png');
    const buffer = await sharp(await fs.readFile(file))
      .resize({ width: key, fit: 'inside' })
      .png()
      .toBuffer();
    logoCache.set(key, buffer);
    return buffer;
  } catch (error) {
    logoCache.set(key, null);
    console.error('[product-image] brand mark unavailable, serving without it:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (await rateLimited(clientIp(request))) {
    return new NextResponse('Too many image requests. Please slow down.', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  const src = request.nextUrl.searchParams.get('src');
  const formatParam = request.nextUrl.searchParams.get('format');
  const format: 'webp' | 'png' | 'jpeg' =
    formatParam === 'png' || formatParam === 'jpeg' ? formatParam : 'webp';

  /**
   * `?strip=off` skips the supplier-mark boxes for a single request.
   *
   * The boxes below are measured geometry belonging to one supplier's packshots. Another supplier's
   * photos can carry no mark at all, so the same boxes erase the product instead of a watermark —
   * `lib/product-image.ts` sets this flag for those sources. The white canvas and the salon's mark
   * still apply, so branded output is unaffected; only the erasing step is skipped.
   */
  const stripRequested = request.nextUrl.searchParams.get('strip') !== 'off';

  /** `?mark=off` leaves out the salon's own mark, for callers that overlay it in the DOM instead. */
  const markRequested = request.nextUrl.searchParams.get('mark') !== 'off';

  if (!src) {
    return NextResponse.json({ error: 'Missing ?src=' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: 'The src is not a valid URL.' }, { status: 400 });
  }

  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https image sources are allowed.' }, { status: 400 });
  }
  if (!(await isSafeHost(target.hostname))) {
    return NextResponse.json({ error: 'That host is not allowed.' }, { status: 403 });
  }

  /**
   * Photographs the owner uploaded through the admin console come from our own Storage bucket.
   *
   * Those files never carry a supplier watermark, so the erasing boxes would do nothing but paint
   * white over real content — the same failure the `?strip=off` flag exists for, except this case is
   * not per-caller, it is per-source. Detecting the host is what keeps uploads safe without asking
   * every call site to remember the flag. External supplier hosts are unaffected.
   */
  const isOwnStorage = (() => {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configured) return false;
    try {
      return new URL(configured).hostname === target.hostname;
    } catch {
      return false;
    }
  })();

  const stripMarks = STRIP_WATERMARK && stripRequested && !isOwnStorage;

  /* ── fetch the original ─────────────────────────────────────────────────────────────────── */
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { 'User-Agent': 'AlikatiBeautyHome/1.0 (+product-image)' },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (error) {
    console.error('[api/product-image] upstream fetch failed:', error);
    return NextResponse.json({ error: 'Could not reach the image source.' }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `The image source returned ${upstream.status}.` },
      { status: 502 }
    );
  }

  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: 'That image is too large to process.' }, { status: 413 });
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: 'That image is too large to process.' }, { status: 413 });
  }

  /* ── transform ──────────────────────────────────────────────────────────────────────────── */
  try {
    const probe = await sharp(body).metadata();

    if (!probe.width || !probe.height) {
      throw new Error('source has no dimensions');
    }

    // Bound the work: a huge source is scaled down before anything is composited.
    const working =
      Math.max(probe.width, probe.height) > MAX_DIMENSION
        ? await sharp(body)
            .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside' })
            .flatten({ background: '#ffffff' })
            .toBuffer()
        : await sharp(body).flatten({ background: '#ffffff' }).toBuffer();

    /**
     * Gentle colour optimisation, applied to the flattened white canvas.
     *
     * Supplier packshots arrive at inconsistent exposures — some washed out, some flat — and the
     * storefront shows them side by side, where the differences read as sloppiness. A small
     * saturation lift plus a touch of contrast evens them out. Both figures are deliberately
     * modest: the brief is "crisp and true to life", and packaging colour is a claim customers
     * compare against the physical product, so this corrects for a dull JPEG without inventing
     * colours the product does not have. It is baked into the served bytes rather than applied as
     * a CSS filter, so link previews and the admin console see the same thing the card does.
     */
    const tuned = await sharp(working)
      .modulate({ saturation: 1.05 })
      .linear(1.03, -4)
      .toBuffer();

    /*
      White background, then framing.

      Both happen here rather than as a batch job so a newly added product is corrected on its first
      render without anyone remembering to run anything. See lib/images/background.ts for why each step
      exists; the short version is that `flatten()` alone only fills transparency, so a photograph taken
      on a black or cream sweep arrived on the page still black or cream, and the product's own frame
      gave the badge nowhere to sit but on top of it.
    */
    const cleaned = await cleanProductBackground(tuned, { stripMarks: stripMarks });
    const framed = await frameProductSquare(cleaned.buffer);

    const meta = await sharp(framed).metadata();
    const width = meta.width!;
    const height = meta.height!;

    const layers: Sharp.OverlayOptions[] = [];

    /**
     * `?mark=off` omits the salon's own mark.
     *
     * The storefront draws that badge in the DOM over the image (`WatermarkBadge`), so baking it here
     * as well would print it twice on every card. Only the surfaces that render an overlay ask for
     * this; link previews, order confirmations, WhatsApp messages, the cart and the admin console
     * request the image without the flag and keep the baked mark.
     */
    if (markRequested) {
      const logoWidth = Math.max(24, Math.round(width * BRAND_MARK_SIZE));
      const logo = await brandMark(logoWidth);
      // Skipped entirely when unavailable — the image is composited without it rather than failing.
      if (logo) {
        const logoBox = await sharp(logo).metadata();
        const logoHeight = logoBox.height ?? logoWidth;
        const inset = Math.round(height * BRAND_MARK_INSET);
        layers.push({
          input: logo,
          // Anchored to the bottom-left of the canvas, which is white margin, not product.
          top: Math.max(0, height - inset - logoHeight),
          left: Math.round(width * BRAND_MARK_INSET),
        });
      }
    }

    // The canvas starts white, so a source with transparency lands on white rather than black.
    /**
     * The encode MUST be chained onto the same pipeline as the composite.
     *
     * A raw `{ create }` input has no format to inherit, so calling `toBuffer()` on its own emits
     * **raw RGBA pixels** — 10.2 MB of them for a 1600² canvas, starting `ffffffff` — not an image.
     * Feeding that buffer to a second `sharp()` fails with "Input buffer contains unsupported image
     * format". Setting the output format on the same pipeline is what produces a real image file.
     */
    const canvas = () =>
      sharp({
        create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        // `tuned`, not `working`: the colour pass above has already run, and the marks are sized
        // against the same dimensions, so compositing on the tuned buffer keeps everything aligned.
      }).composite([{ input: framed, top: 0, left: 0 }, ...layers]);

    const output =
      format === 'png'
        ? await canvas().png({ compressionLevel: 9 }).toBuffer()
        : format === 'jpeg'
          ? await canvas().flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
          : await canvas().webp({ quality: 86 }).toBuffer();

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        'Content-Type': `image/${format === 'jpeg' ? 'jpeg' : format}`,
        'Content-Length': String(output.length),
        // Stable URL per source, so a long shared cache is right; the upstream fetch above is
        // revalidated weekly, which bounds how stale a replaced supplier image can be.
        'Cache-Control': `public, max-age=86400, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
      },
    });
  } catch (error) {
    // Never leave a hole where a product photo should be: fall through to the untouched original.
    console.error('[api/product-image] processing failed, serving the original:', error);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}
