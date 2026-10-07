import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { isDemoMode } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';
import { classifyRequest, normalizePath } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

/**
 * Records one page view.
 *
 * ── This endpoint is unauthenticated, and that is unavoidable ────────────────
 * A page view comes from someone who has not signed in and may never sign in, so there is nothing
 * to authenticate. Everything below assumes the caller is hostile:
 *
 *   • Every value that reaches the database is bounded and re-derived here. The path is stripped of
 *     its query string *on this side* rather than trusted from the client, the country comes from
 *     the platform header rather than the body, and the classification is recomputed rather than
 *     accepted. A caller can lie about which page it thinks it is on; it cannot make us store a URL
 *     with an identifier in it.
 *   • It is rate limited on the same Postgres-backed limiter as ordering and booking, generously —
 *     a navigation should always be free, and only a script will notice the ceiling.
 *   • It always answers 204, whatever happened. There is no error to report and no reason to tell a
 *     crawler whether it was recorded.
 *
 * ── Consent is enforced by the client, and that limit is real ───────────────
 * `/components/site/TrafficBeacon.tsx` only fires when the visitor chose "Accept all", which is the
 * promise `/components/site/CookieConsent.tsx` makes in its own comment. Server-side we cannot
 * verify that a request came from a consenting browser — no beacon protocol can — so this is an
 * honour-system boundary, and the honest consequence is that these figures count consenting
 * visitors only. They are a floor, not a census.
 */

const rateLimited = createRateLimiter({
  bucket: 'traffic',
  limit: Number(process.env.TRAFFIC_RATE_LIMIT_PER_MIN ?? 60),
});

/**
 * Secret material for the visitor hash.
 *
 * Falls back to the service-role key, which is secret and already present in this environment, so a
 * deployment that forgets to set `TRAFFIC_SALT` still gets an unguessable salt rather than none.
 *
 * Note what this is protecting against: not an attacker forging traffic, but anyone holding a dump
 * of `traffic_events` walking the hash back to an IP address. IPv4 is only 2³² values, so a *known*
 * salt makes that brute force trivial — with a secret one it is not feasible. If neither value is
 * available we record nothing at all, because a traffic table whose anonymity depends on a
 * hardcoded constant is worse than an empty one.
 */
const HASH_SECRET = process.env.TRAFFIC_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** No content. Used for every outcome, including every failure. */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Today's date **in Kathmandu**, not UTC.
 *
 * The hash rotates daily so no long-lived identifier accumulates, and the SQL aggregates bucket by
 * Nepal days for the same reason the salon does. If the two drifted, a visitor could change hash
 * mid-evening and be counted twice on a day the console calls one day.
 */
function kathmanduDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function visitorHash(ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${ip}|${userAgent}|${kathmanduDay()}|${HASH_SECRET}`)
    .digest('hex');
}

/** The host we are serving as, so a link followed inside the site is not counted as a referral. */
function selfHost(request: NextRequest): string | null {
  const host = request.headers.get('host');
  return host ? host.split(':')[0].toLowerCase().replace(/^www\./, '') : null;
}

/** ISO-3166 alpha-2, as set by the platform's edge. Anything else is discarded rather than stored. */
function country(request: NextRequest): string | null {
  const raw = request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry');
  const value = raw?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) && value !== 'XX' ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    if (isDemoMode() || !HASH_SECRET) return noContent();

    const ip = clientIp(request);
    if (await rateLimited(ip)) return noContent();

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return noContent();
    }

    // The path is taken from the body (the browser knows the route it is on) but normalised here,
    // so a crafted body cannot smuggle a query string or an over-long value into the table.
    const path = normalizePath(String(body.path ?? ''));
    if (!path || path.length > 512) return noContent();

    const userAgent = request.headers.get('user-agent') ?? '';
    const search = String(body.search ?? '');
    const referrer = body.referrer ? String(body.referrer) : request.headers.get('referer');

    const classification = classifyRequest({
      referrer,
      search,
      userAgent,
      selfHost: selfHost(request),
    });

    // A session id is minted per browser tab and dies with it. Bound it rather than trust it.
    const rawSession = String(body.sessionId ?? '').trim();
    const sessionId = /^[A-Za-z0-9_-]{8,64}$/.test(rawSession) ? rawSession : null;

    const admin = createAdminClient();
    if (!admin) return noContent();

    // No `.select()`: PostgREST would implement it as `INSERT … RETURNING`, and the staff read
    // policy has nothing to say about an anonymous insert. The caller needs no row back.
    /*
      Trim to the column bounds here as well as in SQL. The table's CHECK would reject an
      over-long value and take the whole row with it — and because this route swallows every error,
      a single 70-character referrer host would silently turn into a missing page view. A rare but
      real case, and exactly the sort of thing that stays invisible for months.
    */
    await admin.from('traffic_events').insert({
      path,
      source: classification.source,
      source_detail: classification.sourceDetail?.slice(0, 64) ?? null,
      referrer_host: classification.referrerHost?.slice(0, 255) ?? null,
      device: classification.device,
      browser: classification.browser,
      os: classification.os,
      country: country(request),
      session_id: sessionId,
      visitor_hash: visitorHash(ip, userAgent),
      is_bot: classification.isBot,
    });

    return noContent();
  } catch {
    /*
      Never surface a failure. A page view is the least important write in the app — it must not be
      able to break a page, and an error body would only tell a crawler what it had found. The
      console will show a dip if this is failing persistently, which is the right place to notice it.
    */
    return noContent();
  }
}
