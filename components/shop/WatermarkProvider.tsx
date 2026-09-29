'use client';

import * as React from 'react';
import { WATERMARK_OFF, type WatermarkConfig } from '@/lib/watermark';

/**
 * Carries the badge config to the cards.
 *
 * The public layout reads the three `salon_settings` columns once per request and hands them down
 * from here, so a product card never has to fetch anything of its own just to draw a logo. The
 * types and the "should this render" decision live in `lib/watermark.ts` so server components can
 * use them too; this file holds only the React plumbing.
 */

const WatermarkContext = React.createContext<WatermarkConfig>(WATERMARK_OFF);

export function WatermarkProvider({
  value,
  children,
}: {
  value: WatermarkConfig;
  children: React.ReactNode;
}) {
  return <WatermarkContext.Provider value={value}>{children}</WatermarkContext.Provider>;
}

/** Falls back to a disabled config, so a card rendered outside the provider draws no badge. */
export function useWatermark(): WatermarkConfig {
  return React.useContext(WatermarkContext);
}
