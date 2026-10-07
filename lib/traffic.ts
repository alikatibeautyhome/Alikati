/**
 * Traffic classification — turning a raw request into the few facts worth storing.
 *
 * Pure functions, no dependencies. The obvious alternative is a user-agent parsing library, and it
 * was rejected on purpose: a UA parser is a large, frequently-wrong lookup table that is
 * reverse-engineered from a string the client controls, and this app has 13 runtime dependencies
 * that are all load-bearing. What the console needs is four coarse answers — phone or desktop,
 * which browser family, which OS, crawler or person — and those are cheap to get right.
 *
 * Everything here is deliberately lossy. Precision is not the point; the point is being able to
 * say "most visitors are on phones and arrive from Facebook" without storing anything about them.
 */

export type TrafficSource = 'direct' | 'search' | 'social' | 'referral' | 'affiliate';
export type TrafficDevice = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface TrafficClassification {
  source: TrafficSource;
  sourceDetail: string | null;
  referrerHost: string | null;
  device: TrafficDevice;
  browser: string | null;
  os: string | null;
  isBot: boolean;
}

/**
 * Search engines, matched on the referrer's hostname rather than a substring of the whole URL — a
 * link to `google.com.evil.example` must not count as Google.
 */
const SEARCH_HOSTS = [
  'google.',
  'bing.',
  'duckduckgo.',
  'yahoo.',
  'ecosia.',
  'yandex.',
  'baidu.',
  'brave.',
  'qwant.',
  'startpage.',
];

/** Social platforms, for the same reason and in the same shape. */
const SOCIAL_HOSTS: Record<string, string> = {
  'facebook.': 'facebook',
  'fb.': 'facebook',
  'instagram.': 'instagram',
  'tiktok.': 'tiktok',
  'twitter.': 'x',
  'x.com': 'x',
  't.co': 'x',
  'linkedin.': 'linkedin',
  'lnkd.in': 'linkedin',
  'pinterest.': 'pinterest',
  'youtube.': 'youtube',
  'reddit.': 'reddit',
  'whatsapp.': 'whatsapp',
  'wa.me': 'whatsapp',
  't.me': 'telegram',
  'threads.': 'threads',
  'snapchat.': 'snapchat',
};

/** Crawlers, link previewers and uptime monitors. Kept broad: a false positive costs one row. */
const BOT_PATTERN =
  /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|vkshare|whatsapp|telegrambot|headlesschrome|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|monitoring|curl|wget|python-requests|axios|node-fetch|go-http-client|java\/|okhttp|semrush|ahrefs|moz\.com|screaming frog|dataprovider|jetoctopus|serpstat/i;

/**
 * Strip the query string and the hash.
 *
 * This is a privacy control, not tidiness. `?ref=`, `?utm_*` and email-link tokens all travel in
 * the query string, and a search term does too on some engines — `?q=` from a referrer that leaks
 * through would put what somebody typed into a table nobody meant to keep it in. The path alone
 * answers "which pages are seen", which is the question being asked.
 */
export function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || '/';
  // Collapse a trailing slash so `/shop/` and `/shop` are one row, but never turn `/` into ``.
  const trimmed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery;
  return trimmed.slice(0, 512) || '/';
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    // `new URL` needs a scheme; an origin-less referrer would otherwise throw.
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Where the visitor came from.
 *
 * Affiliate is checked first and wins over everything: the storefront has a `?ref=CODE` programme,
 * and the whole point of it is attributing a sale to the link that produced it. A `?ref=` arriving
 * from a Facebook post must count as the affiliate, not as Facebook.
 *
 * Returns a coarse bucket for grouping plus the specific name for reading.
 */
export function classifySource(
  referrer: string | null | undefined,
  search: string,
  selfHost: string | null
): Pick<TrafficClassification, 'source' | 'sourceDetail' | 'referrerHost'> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const ref = (params.get('ref') || params.get('affiliate') || '').trim();

  if (ref) {
    return { source: 'affiliate', sourceDetail: `ref:${ref.slice(0, 48)}`, referrerHost: null };
  }

  const host = hostOf(referrer);
  const details = { referrerHost: host };

  if (!host) return { source: 'direct', sourceDetail: null, ...details };

  // A link followed inside the site is a direct visit, not a referral from ourselves.
  if (selfHost && host === selfHost) {
    return { source: 'direct', sourceDetail: null, referrerHost: null };
  }

  if (SEARCH_HOSTS.some((needle) => host.includes(needle))) {
    return { source: 'search', sourceDetail: host, ...details };
  }

  for (const [needle, name] of Object.entries(SOCIAL_HOSTS)) {
    if (host.includes(needle)) return { source: 'social', sourceDetail: name, ...details };
  }

  return { source: 'referral', sourceDetail: host, ...details };
}

/**
 * Device, browser, OS and bot-ness from a user-agent string.
 *
 * Order matters in every branch. Edge and Opera both claim to be Chrome, Chrome claims to be
 * Safari, and an iPad claims to be a Mac. Each check therefore runs before the one it impersonates.
 */
export function parseUserAgent(userAgent: string | null | undefined): Pick<
  TrafficClassification,
  'device' | 'browser' | 'os' | 'isBot'
> {
  const ua = userAgent ?? '';

  // No user-agent at all is a script far more often than a browser.
  if (!ua || BOT_PATTERN.test(ua)) {
    return { device: 'unknown', browser: null, os: null, isBot: true };
  }

  // ── Device ────────────────────────────────────────────────────────────────
  // Tablet before mobile: an iPad's UA contains neither "mobile" nor is it an iPhone, and Android
  // tablets say "Android" without "Mobile" — but plenty of Android tablets include "Mobile" too,
  // so the tablet tokens are tested first.
  let device: TrafficDevice = 'desktop';
  if (/ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/i.test(ua)) {
    device = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone/i.test(ua)) {
    device = 'mobile';
  }

  // ── OS ────────────────────────────────────────────────────────────────────
  let os: string | null = null;
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/windows phone/i.test(ua)) os = 'Windows Phone';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  // ── Browser ───────────────────────────────────────────────────────────────
  let browser: string | null = null;
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/ucbrowser/i.test(ua)) browser = 'UC Browser';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return { device, browser, os, isBot: false };
}

/** The whole pipeline in one call, for the ingest route. */
export function classifyRequest(input: {
  referrer: string | null | undefined;
  search: string;
  userAgent: string | null | undefined;
  selfHost: string | null;
}): TrafficClassification {
  return {
    ...classifySource(input.referrer, input.search, input.selfHost),
    ...parseUserAgent(input.userAgent),
  };
}

/** Display labels for the console, so the raw stored tokens are not shown to staff. */
export const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  search: 'Search',
  social: 'Social',
  referral: 'Referral',
  affiliate: 'Affiliate',
};

export const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
  unknown: 'Unknown',
};
