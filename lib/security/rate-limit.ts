/**
 * A small fixed-window rate limiter.
 *
 * This replaces four separately copy-pasted `rateLimited()` helpers — one per public write route —
 * which had already drifted into three different implementations with three different limits. A
 * security control that exists in four slightly different versions is a control whose weakest copy
 * is the real one, so they are now one function with the limit passed in.
 *
 * ── What this is honestly not ────────────────────────────────────────────────
 * The counter lives in module memory, so it is **per server instance**: two instances behind a load
 * balancer each allow the full quota, and a deploy resets every counter to zero. For a shop of this
 * size that is a reasonable trade — it stops the ordinary cases (a script hammering checkout, a
 * scraper looping the image proxy) without introducing Redis, another service to run and pay for,
 * and another credential to leak.
 *
 * If it ever needs to hold under a distributed attack, this file is the only thing that changes:
 * swap the Map for a shared store with the same interface. Everything else calls `limit(key)`.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** True when this key has gone over its quota and should be refused. */
  (key: string): boolean;
}

export interface RateLimiterOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. Defaults to one minute. */
  windowMs?: number;
  /**
   * Cap on tracked keys before expired entries are swept. Bounds memory if someone rotates keys —
   * which, now that the key is a real IP, means a genuine flood rather than one spoofed header.
   */
  maxKeys?: number;
}

export function createRateLimiter({
  limit,
  windowMs = 60_000,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, Window>();

  return function limitReached(key: string): boolean {
    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || entry.resetAt <= now) {
      /*
        Sweep on insert rather than on a timer: a background interval in a hot path keeps the
        process awake and does work even when there is no traffic. Expired entries are only ever
        abandoned, so collecting them here costs nothing extra.
      */
      if (windows.size >= maxKeys) {
        for (const [candidate, window] of windows) {
          if (window.resetAt <= now) windows.delete(candidate);
        }
      }
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > limit;
  };
}

/** The 429 body every limited route returns, so the wording is identical everywhere. */
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again in a minute.';
