/**
 * The brand badge drawn over product imagery, as configured in the admin console.
 *
 * Deliberately **not** a `'use client'` module: the public layout and the product page are server
 * components and need to decide whether the overlay will render so they can ask
 * `/api/product-image` for an image *without* the baked mark. Importing a plain function out of a
 * client module would hand a server component a client reference it cannot call, so the types and
 * the decision live here and the React context lives in `components/shop/WatermarkProvider.tsx`.
 */

import type { SalonSettings } from '@/types/database.types';

/** The three columns the badge is driven by. */
export type WatermarkSource = Pick<
  SalonSettings,
  'watermark_enabled' | 'watermark_logo_url' | 'watermark_size_px'
>;

export interface WatermarkConfig {
  /** The admin switch. Off means the badge is never drawn, uploaded logo or not. */
  enabled: boolean;
  /** Public URL of the uploaded PNG, or `null` when nothing has been uploaded. */
  logoUrl: string | null;
  /** Badge height in CSS pixels. The database bounds this to 32–64. */
  sizePx: number;
}

/** The default slider position, matching the column default. */
export const WATERMARK_DEFAULT_SIZE_PX = 44;

/** Used wherever settings are unavailable or the badge is not wanted. */
export const WATERMARK_OFF: WatermarkConfig = {
  enabled: false,
  logoUrl: null,
  sizePx: WATERMARK_DEFAULT_SIZE_PX,
};

/**
 * Normalises a settings row into the badge config.
 *
 * The size is clamped here as well as in the database so a value that predates the constraint — or
 * arrives from a hand-written API call — can never produce an unreadable badge.
 */
export function watermarkConfigFromSettings(settings: WatermarkSource | null | undefined): WatermarkConfig {
  if (!settings) return WATERMARK_OFF;

  return {
    enabled: Boolean(settings.watermark_enabled),
    logoUrl: settings.watermark_logo_url?.trim() || null,
    sizePx: Math.min(64, Math.max(32, Number(settings.watermark_size_px) || WATERMARK_DEFAULT_SIZE_PX)),
  };
}

/**
 * Whether a badge should actually be drawn.
 *
 * Both halves matter: switched on with nothing uploaded must render nothing, and an uploaded logo
 * with the switch off must render nothing either. Narrows `logoUrl` to a string so callers cannot
 * render an empty `<img>` by checking only one of the two.
 */
export function isWatermarkVisible(
  config: WatermarkConfig
): config is WatermarkConfig & { logoUrl: string } {
  return config.enabled && Boolean(config.logoUrl);
}
