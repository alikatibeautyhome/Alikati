import type { NextRequest } from 'next/server';

/**
 * Working out who is really calling.
 *
 * Every rate limit in this app is keyed on the caller's IP, so a wrong answer here does not make
 * the limit slightly weaker — it makes it **no limit at all**. That is what the previous version
 * did: it read `x-forwarded-for` and took the *first* entry.
 *
 * `X-Forwarded-For` is a list, `client, proxy1, proxy2 …`, and each hop **appends**. The leftmost
 * entry is whatever the caller typed into the header, so `X-Forwarded-For: <anything>` handed out a
 * fresh bucket on every request and the limiter never fired. The rightmost entry is the one added
 * by the proxy standing nearest us, which is the only one the caller cannot forge.
 *
 * Order of preference:
 *
 *  1. Platform-set headers. Cloudflare's `cf-connecting-ip` and Vercel's `x-vercel-forwarded-for`
 *     are written by the edge itself and are authoritative — nothing upstream of the edge can set
 *     them, which is exactly why they beat parsing XFF by hand.
 *  2. `x-real-ip`, set by most reverse proxies to the immediate peer.
 *  3. The **rightmost** `x-forwarded-for` entry.
 *
 * When nothing identifies the caller we return a single shared bucket rather than a unique value.
 * That errs towards throttling everyone a little instead of letting one caller slip through
 * untracked — an over-strict limit is a nuisance, an absent one is a hole.
 *
 * Known limit: on a dynamic host header, a client able to reach the app directly (bypassing the
 * proxy) could still forge any header. Defeating that needs a network-level fix — the app must only
 * be reachable through the proxy — and is not something this function can do for itself.
 */
const TRUSTED_HEADERS = ['cf-connecting-ip', 'x-vercel-forwarded-for', 'true-client-ip', 'x-real-ip'] as const;

/** A single shared bucket, used when the caller cannot be identified. */
export const UNKNOWN_CLIENT = 'unknown';

export function clientIp(request: NextRequest | Request): string {
  for (const header of TRUSTED_HEADERS) {
    const value = request.headers.get(header);
    const candidate = value?.split(',')[0]?.trim();
    if (candidate) return candidate;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Rightmost, not leftmost: see the note above.
    const parts = forwarded.split(',');
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const candidate = parts[i]?.trim();
      if (candidate) return candidate;
    }
  }

  return UNKNOWN_CLIENT;
}
