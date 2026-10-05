import { createAdminClient } from '@/lib/supabase/server';

/**
 * Rate limiting, counted in Postgres.
 *
 * ── Why the counter left process memory ──────────────────────────────────────
 * The previous version kept its counts in a module-level Map, which is per server instance. That had
 * three consequences, in increasing order of seriousness: a deploy reset every counter to zero; two
 * instances each allowed the full quota, so the real limit was the advertised limit multiplied by
 * however many instances the platform had spawned; and each instance held its own copy of the state.
 * Serverless platforms scale up precisely when traffic is high, which is precisely when a limit
 * needs to hold.
 *
 * The count now lives in a Postgres table, incremented by a single atomic statement
 * (`rate_limit_hit`, migration 0029). Postgres is already a dependency, so this needs no Redis to
 * run, pay for, and leak a credential for.
 *
 * ── The failure mode is chosen deliberately ──────────────────────────────────
 * If the database call fails, this **falls back to the in-memory limiter** rather than either
 * failing open or failing closed:
 *
 *   • Failing closed (refuse everything) would turn a database blip into a total outage of
 *     ordering, booking and review submission — worse than the abuse being guarded against.
 *   • Failing open would silently disable the control with nothing left in its place.
 *
 * The fallback keeps a real limit in force per instance, which is weaker than the shared counter but
 * far stronger than nothing, and the failure is logged so it is not invisible.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Resolves true when this key has gone over its quota and should be refused. */
  (key: string): Promise<boolean>;
}

export interface RateLimiterOptions {
  /** Namespace for this limiter's counters, e.g. 'booking'. Keeps routes from sharing a budget. */
  bucket: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. Defaults to one minute. */
  windowSecs?: number;
}

export function createRateLimiter({ bucket, limit, windowSecs = 60 }: RateLimiterOptions): RateLimiter {
  /*
    Kept only as the degraded path. Small by design — it exists to hold a line during a database
    failure, not to be the primary control.
  */
  const local = new Map<string, Window>();

  function localOverLimit(key: string): boolean {
    const now = Date.now();
    const entry = local.get(key);
    const windowMs = windowSecs * 1000;

    if (!entry || entry.resetAt <= now) {
      if (local.size >= 5_000) {
        for (const [candidate, window] of local) {
          if (window.resetAt <= now) local.delete(candidate);
        }
      }
      local.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  return async function overLimit(key: string): Promise<boolean> {
    try {
      const admin = createAdminClient();
      // Demo mode has no database. The local limiter is the only option, and it is enough there.
      if (!admin) return localOverLimit(key);

      const { data, error } = await admin.rpc('rate_limit_hit', {
        p_bucket: `${bucket}:${key}`,
        p_limit: limit,
        p_window_secs: windowSecs,
      });

      if (error) {
        console.error('[rate-limit] shared counter unavailable, using local fallback:', error.message);
        return localOverLimit(key);
      }
      return data === true;
    } catch (error) {
      console.error('[rate-limit] shared counter threw, using local fallback:', error);
      return localOverLimit(key);
    }
  };
}

/** The 429 body every limited route returns, so the wording is identical everywhere. */
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again in a minute.';
