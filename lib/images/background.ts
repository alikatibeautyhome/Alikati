import sharp from 'sharp';

/**
 * Making a supplier photograph look like a catalogue packshot: white background, whole product,
 * nothing painted over it.
 *
 * ── The three faults this exists to fix
 *
 * 1. **The background is not white.** `flatten()` only fills *transparency*; a JPEG shot on a black or
 *    cream sweep keeps that background. Across the live catalogue 11 of 54 images were like this —
 *    one pure black (rgb 0,0,0) and ten light grey / cream, which on a shop grid reads as dirty white
 *    next to the genuinely white ones.
 *
 * 2. **The product was being painted over.** The erasing boxes for the supplier's marks are fixed
 *    fractions of the frame. When a product extends into one — a row of bottles does — the box wipes
 *    real artwork: white rectangles where a label should be.
 *
 * 3. **The product sat hard against the frame edge.** No breathing room, and no room for the salon's
 *    badge either, so the badge landed on the product.
 *
 * ── How each is addressed
 *
 * 1. **Border-seeded flood fill.** The background colour is estimated from the frame's edge, then a
 *    flood fill from the edge replaces only pixels *connected to the border* that match it. Seeding
 *    from the edge is the whole point: a global "replace this colour" would also erase black text or
 *    a cream label *inside* the product, whereas a fill that must reach the pixel from outside can
 *    never touch the product's interior.
 *
 * 2. **A mark is erased only if it is standing on background.** Each region is measured first; if it
 *    holds more than a little product it is left completely alone. A supplier logo may then survive —
 *    which is the correct trade, because a surviving logo is a cosmetic problem and an erased product
 *    is a broken listing.
 *
 * 3. **Trim, then pad to a square.** The product is trimmed to its true bounding box and centred on a
 *    square white canvas, so it is never clipped by the frame and the badge has a guaranteed white
 *    margin to live in.
 */

/** How far a pixel may differ from the background colour and still count as background. */
const BACKGROUND_TOLERANCE = 30;

/**
 * Anti-aliased edges of a cut-out leave pixels part-way between product and background. Raising them
 * to white removes the fringe; going much beyond this starts eating the product's own outline.
 */
const FRINGE_TOLERANCE = 62;

/** Below this share of border pixels agreeing, the frame is not a uniform background — leave it be. */
const MIN_BORDER_AGREEMENT = 0.55;

/** A mark region holding more product than this is left untouched rather than risk erasing artwork. */
const MAX_MARK_PRODUCT_SHARE_FOR_ERASE = 0.3;

/**
 * If the middle of the frame is mostly the same colour as the edge, there is no background here.
 *
 * This is the guard against the worst thing this module can do. Some catalogue entries are not
 * photographs of a product at all — they are flat carton artwork shot edge to edge, where the border
 * colour *is the product's own surface*. A uniform border then looks exactly like a sweep, the fill
 * whitens the packaging, and the listing loses its box. Requiring the centre to differ from the border
 * separates "product on a background" from "product is the whole frame", which is the distinction the
 * fill depends on and cannot see by itself.
 */
const MAX_CENTRE_BACKGROUND_SHARE = 0.45;

/**
 * A fill that covers nearly the whole frame has almost certainly escaped into the product rather than
 * described a background. Real packshots sit around 40–70%; beyond this the result is discarded.
 */
const MAX_PAINTED_SHARE = 0.82;

/** Beyond this, the raw-pixel passes stop being worth their cost; the result is downscaled first. */
const CLEANUP_MAX_DIMENSION = 1600;

/** Margin as a multiplier of the product's longest side. 1.3 leaves roughly 11% of the canvas clear. */
export const FRAME_MARGIN = 1.3;

/**
 * The supplier's own marks, as fractions of the frame.
 *
 * Measured from the imported catalogue: the top-right mark occupies x 68–96%, y 4–12%; the bottom-left
 * mark x 0–30%, y 86–100%. These boxes carry a margin on every side, because a logo left partly
 * visible reads as a rendering fault. Expressed as fractions so they hold at any resolution.
 */
const SUPPLIER_MARK_REGIONS = [
  { x: 0.64, y: 0.01, w: 0.36, h: 0.14 },
  { x: 0.0, y: 0.82, w: 0.34, h: 0.18 },
];

export interface BackgroundCleanup {
  /** The cleaned image, still the same dimensions as the input. */
  buffer: Buffer;
  /** True when a non-white background was actually replaced. */
  whitened: boolean;
  /** Background colour that was replaced, as `rgb(...)`, for logging and tests. */
  detectedBackground: string | null;
  /** How many supplier-mark regions were cleared. */
  marksCleared: number;
  /** How many were left alone because product was in the way. */
  marksPreserved: number;
  /**
   * Why nothing was whitened, when nothing was. `null` when the background was already white or was
   * successfully replaced. Worth surfacing in logs: "left alone on purpose" and "did nothing" look
   * identical from the outside otherwise.
   */
  skippedReason: string | null;
}

/** Median of a list of channel values — robust against a product intruding into the sampled edge. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/** Samples the frame's outer ring and decides whether it describes a uniform background. */
function estimateBackground({ data, width, height, channels }: Raw): {
  rgb: [number, number, number];
  agreement: number;
  /** True when the frame's outer ring is essentially transparent — a cut-out, not a photograph. */
  transparent: boolean;
} {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    // A transparent pixel carries no colour information; skip it rather than read a stale 0.
    if (channels === 4 && data[i + 3] < 128) return;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };

  for (let x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    sample(0, y);
    sample(width - 1, y);
  }

  /*
    Almost every border pixel was transparent. That is a cut-out, and it needs no background work at
    all: `flatten()` in the route already lays it on white. Reporting it as "a photographed scene"
    would be wrong and would send someone looking for a problem that does not exist.
  */
  if (rs.length < 16) return { rgb: [255, 255, 255], agreement: 0, transparent: true };

  const rgb: [number, number, number] = [median(rs), median(gs), median(bs)];
  let agree = 0;
  for (let i = 0; i < rs.length; i++) {
    const d = Math.hypot(rs[i] - rgb[0], gs[i] - rgb[1], bs[i] - rgb[2]);
    if (d <= BACKGROUND_TOLERANCE) agree++;
  }
  return { rgb, agreement: agree / rs.length, transparent: false };
}

/** True when the colour is already white enough that replacing it would be pointless. */
function isNearWhite(rgb: [number, number, number]): boolean {
  return rgb[0] >= 244 && rgb[1] >= 244 && rgb[2] >= 244;
}

/**
 * Pixel distance from the background colour, and whether it is close enough to be background or edge
 * fringe.
 */
function classify(
  data: Buffer,
  index: number,
  channels: number,
  bg: [number, number, number]
): 'background' | 'fringe' | 'subject' {
  const d = Math.hypot(data[index] - bg[0], data[index + 1] - bg[1], data[index + 2] - bg[2]);
  if (d <= BACKGROUND_TOLERANCE) return 'background';
  if (d <= FRINGE_TOLERANCE) return 'fringe';
  return 'subject';
}

function paintWhite(data: Buffer, index: number, channels: number): void {
  data[index] = 255;
  data[index + 1] = 255;
  data[index + 2] = 255;
  if (channels === 4) data[index + 3] = 255;
}

/**
 * Replaces a uniform background with white, growing inwards from the frame's edge.
 *
 * An explicit stack over a preallocated typed array rather than recursion or an array of pairs: this
 * can visit every pixel of a 1600² image, where recursion would overflow the stack and an object-
 * heavy queue would dominate the runtime.
 */
function floodBackgroundToWhite(raw: Raw, bg: [number, number, number]): number {
  const { data, width, height, channels } = raw;
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;
  let painted = 0;

  const seed = (x: number, y: number) => {
    const i = y * width + x;
    if (!seen[i]) {
      seen[i] = 1;
      stack[top++] = i;
    }
  };

  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (top > 0) {
    const i = stack[--top];
    const p = i * channels;
    const kind = classify(data, p, channels, bg);
    if (kind === 'subject') continue;

    // Background becomes pure white; fringe is blended most of the way, which removes the dark or
    // coloured halo an anti-aliased edge would otherwise leave against white.
    if (kind === 'background') {
      paintWhite(data, p, channels);
    } else {
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[p + c] * 0.25 + 255 * 0.75);
      if (channels === 4) data[p + 3] = 255;
    }
    painted++;

    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }

  return painted;
}

/** Share of a region's pixels that are neither white nor near-white — i.e. how much product is there. */
function productShare(raw: Raw, region: { x: number; y: number; w: number; h: number }): number {
  const { data, width, height, channels } = raw;
  const x0 = Math.max(0, Math.round(region.x * width));
  const y0 = Math.max(0, Math.round(region.y * height));
  const x1 = Math.min(width, Math.round((region.x + region.w) * width));
  const y1 = Math.min(height, Math.round((region.y + region.h) * height));

  let total = 0;
  let busy = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * channels;
      total++;
      // A generous threshold: JPEG noise on a "white" background must not read as product.
      if (data[p] < 232 || data[p + 1] < 232 || data[p + 2] < 232) busy++;
    }
  }
  return total === 0 ? 0 : busy / total;
}

function clearRegion(raw: Raw, region: { x: number; y: number; w: number; h: number }): void {
  const { data, width, height, channels } = raw;
  const x0 = Math.max(0, Math.round(region.x * width));
  const y0 = Math.max(0, Math.round(region.y * height));
  const x1 = Math.min(width, Math.round((region.x + region.w) * width));
  const y1 = Math.min(height, Math.round((region.y + region.h) * height));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      paintWhite(data, (y * width + x) * channels, channels);
    }
  }
}

/**
 * Share of the central quarter that matches the estimated background colour.
 *
 * See `MAX_CENTRE_BACKGROUND_SHARE`: a high value means the edge colour is also the product's own
 * surface, so treating it as a background would erase the product.
 */
function centreBackgroundShare(raw: Raw, bg: [number, number, number]): number {
  const { data, width, height, channels } = raw;
  const x0 = Math.floor(width * 0.25);
  const x1 = Math.ceil(width * 0.75);
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.ceil(height * 0.75);

  let total = 0;
  let match = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * channels;
      total++;
      if (Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]) <= BACKGROUND_TOLERANCE) {
        match++;
      }
    }
  }
  return total === 0 ? 0 : match / total;
}

/**
 * Whitens a non-white background, then clears any supplier mark that is standing on it.
 *
 * Returns the input untouched (and says so) when the frame is not a uniform background — a photograph
 * with a real scene behind the product is not something a colour fill can improve, and guessing would
 * risk the product.
 */
export async function cleanProductBackground(
  input: Buffer,
  options: { stripMarks?: boolean } = {}
): Promise<BackgroundCleanup> {
  const stripMarks = options.stripMarks !== false;
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) {
    return {
      buffer: input,
      whitened: false,
      detectedBackground: null,
      marksCleared: 0,
      marksPreserved: 0,
      skippedReason: 'the source has no readable dimensions',
    };
  }

  // Bound the pixel work by downscaling first; the caller composites this back at full size.
  const scale = Math.max(meta.width, meta.height) > CLEANUP_MAX_DIMENSION
    ? CLEANUP_MAX_DIMENSION / Math.max(meta.width, meta.height)
    : 1;
  const workW = Math.max(1, Math.round(meta.width * scale));
  const workH = Math.max(1, Math.round(meta.height * scale));

  const prepared = scale < 1
    ? sharp(input).resize({ width: workW, height: workH, fit: 'fill' })
    : sharp(input);
  const { data, info } = await prepared.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = { data, width: info.width, height: info.height, channels: info.channels };

  const { rgb, agreement, transparent } = estimateBackground(raw);

  // A non-uniform frame is a photograph, not a sweep. Leave it entirely alone rather than risk the
  // product: the honest outcome is an unchanged image, not a damaged one.
  const uniform = agreement >= MIN_BORDER_AGREEMENT;
  const centreShare = uniform ? centreBackgroundShare(raw, rgb) : 1;

  let whitened = false;
  let skippedReason: string | null = null;
  let marksCleared = 0;
  let marksPreserved = 0;

  if (transparent) {
    skippedReason = 'the source background is already transparent, so it already renders on white';
  } else if (!uniform) {
    skippedReason = 'the frame is not a uniform background (a photographed scene, not a sweep)';
  } else if (isNearWhite(rgb)) {
    skippedReason = 'the background is already white';
  } else if (centreShare > MAX_CENTRE_BACKGROUND_SHARE) {
    // The product fills the frame — flat carton artwork or a label shot edge to edge. Its own surface
    // is what we measured, so there is no background to replace.
    skippedReason = 'the product fills the frame; the edge colour is the product itself, not a background';
  } else {
    /*
      Fill a scratch copy, so a fill that turns out to have escaped can be discarded rather than
      repaired. The two guards above catch the cases we know about; this catches the ones we do not.
    */
    const pristine = Buffer.from(data);
    const painted = floodBackgroundToWhite(raw, rgb);
    const paintedShare = painted / (info.width * info.height);

    if (paintedShare > MAX_PAINTED_SHARE) {
      pristine.copy(data);
      skippedReason = `the fill covered ${(paintedShare * 100).toFixed(0)}% of the frame, which means it escaped into the product`;
    } else {
      // Only call it whitened if it changed a meaningful area; otherwise leave the flag off so callers
      // and logs are not misled into thinking work happened.
      whitened = paintedShare > 0.04;
      if (!whitened) skippedReason = 'almost nothing needed changing';
    }
  }

  for (const region of stripMarks ? SUPPLIER_MARK_REGIONS : []) {
    if (productShare(raw, region) > MAX_MARK_PRODUCT_SHARE_FOR_ERASE) {
      marksPreserved++;
      continue;
    }
    clearRegion(raw, region);
    marksCleared++;
  }

  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();

  return {
    buffer: out,
    whitened,
    detectedBackground: uniform ? `rgb(${rgb.join(',')})` : null,
    marksCleared,
    marksPreserved,
    skippedReason,
  };
}

/**
 * Trims the product to its true bounding box and centres it on a **square** white canvas.
 *
 * Square on purpose. The storefront frame is square with `object-contain`, so a square source fills it
 * exactly — which is what turns the padding into a dependable margin. A wide canvas would be
 * letterboxed, and the guaranteed margin the badge relies on would shrink without warning.
 *
 * This is also what makes "not cropped" structural: whatever the source's framing, the product is
 * measured and then given room, rather than being trusted to have had room already.
 */
export async function frameProductSquare(
  input: Buffer,
  marginMultiplier: number = FRAME_MARGIN
): Promise<Buffer> {
  const trimmed = await sharp(input)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 12 })
    .toBuffer()
    .catch(async () => {
      // `trim` throws when there is nothing to trim (a frame that is uniform edge to edge). Falling
      // back to the untrimmed image keeps a blank product photo rendering as a blank photo.
      return input;
    });

  const meta = await sharp(trimmed).metadata();
  if (!meta.width || !meta.height) return trimmed;

  const side = Math.round(Math.max(meta.width, meta.height) * marginMultiplier);
  const left = Math.max(0, Math.round((side - meta.width) / 2));
  const top = Math.max(0, Math.round((side - meta.height) / 2));

  return sharp({
    create: { width: side, height: side, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: trimmed, top, left }])
    .png()
    .toBuffer();
}
