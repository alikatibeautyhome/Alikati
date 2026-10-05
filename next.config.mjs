/**
 * Where the shop loads things from. Kept next to the config so the Content-Security-Policy below
 * and the image allowlist can never disagree about who is trusted.
 */
const SUPABASE_HOSTS = ['https://*.supabase.co', 'https://*.supabase.in'];

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Content-Security-Policy.
 *
 * The shop shipped with `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` and no
 * CSP at all, so the browser was willing to run a script from anywhere and post a form to anywhere.
 * What this buys, even while inline scripts remain allowed:
 *
 *   • `object-src 'none'`      — no plugin/embed route into the page.
 *   • `base-uri 'self'`        — stops `<base href>` being injected to re-point every relative URL.
 *   • `form-action 'self'`     — a payment form cannot be silently re-pointed at another host.
 *   • `frame-ancestors 'self'` — clickjacking, matching `X-Frame-Options`.
 *   • `connect-src`/`img-src`  — a script that does get in has far fewer places to send data.
 *
 * ── The honest limitation ────────────────────────────────────────────────────
 * `script-src` still carries `'unsafe-inline'`, because Next.js emits inline bootstrap and
 * hydration scripts and the JSON-LD blocks are inline by definition. Removing it needs a
 * nonce minted per request in middleware and threaded through the layout — which also forces every
 * page to render dynamically, giving up the static and ISR caching the shop currently relies on
 * (the homepage revalidates every 60s; the sitemap hourly). That is a real availability and cost
 * trade-off, not a free win, so it is deliberately not made here. Until then this CSP blocks whole
 * classes of attack but does not make XSS impossible.
 *
 * `upgrade-insecure-requests` is production-only: on `http://localhost` it would rewrite the dev
 * server's own asset URLs to https and break local development.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Inline styles are unavoidable: Tailwind's runtime, Next's injected <style>, and the theme
  // bootstrap's style attribute.
  "style-src 'self' 'unsafe-inline'",
  // `data:`/`blob:` cover Next's blur placeholders and the object URLs the admin uploaders preview.
  // Supabase Storage is listed because the brand watermark badge on every product card is served
  // straight from there rather than through the image pipeline.
  ["img-src 'self' data: blob:", ...SUPABASE_HOSTS].join(' '),
  // Fonts are self-hosted by `next/font`, so no Google Fonts origin is needed.
  "font-src 'self' data:",
  // The browser talks to Supabase directly (auth, catalogue, and the staff console under RLS).
  ["connect-src 'self'", ...SUPABASE_HOSTS, 'wss://*.supabase.co', 'wss://*.supabase.in'].join(' '),
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Lint is run explicitly via `npm run lint`, not as a build gate.
  eslint: { ignoreDuringBuilds: true },

  // Stops the response advertising the framework and version in `X-Powered-By` — free reconnaissance
  // for anyone scanning for a known Next.js CVE.
  poweredByHeader: false,

  images: {
    remotePatterns: [
      // Supabase Storage public CDN objects (your own product photography).
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      // Supplier catalogue images imported by scripts/import-supplier-catalog.mjs.
      // Replace these with your own photography before launch — see the README.
      { protocol: 'https', hostname: 'colorpluscosmetics.com' },
      { protocol: 'https', hostname: 'www.colorpluscosmetics.com' },
      { protocol: 'https', hostname: 'welltencosmetic.com' },
      { protocol: 'https', hostname: 'www.welltencosmetic.com' },
    ],
    // SVG placeholders are used for seeded/demo media. Only trusted, repository-owned
    // assets should ever be served through this path.
    dangerouslyAllowSVG: true,
    /*
      Two mitigations that make `dangerouslyAllowSVG` survivable. An SVG is a document, not just a
      picture, so if one is ever served from an untrusted path it can carry script. Returning it as
      an attachment stops the browser rendering it as a page at all, and the sandbox policy means
      anything that does render it gets no script execution and no same-origin privileges.
    */
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Nothing on this site uses the camera, microphone or location, so nothing should be able
          // to ask for them — including anything that manages to inject a script.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Prevents the browser resolving hostnames for links before the user follows them.
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          /*
            Cross-origin isolation. Each of these closes a specific cross-site behaviour:

            • COOP `same-origin` — severs the `window.opener` link to any page that opens this one,
              which is the handle used to navigate a tab the user thinks is still the shop.
            • CORP `same-site`    — stops another origin loading our responses as a subresource,
              which is how a page can read data out of an endpoint it cannot call.
            • X-Permitted-Cross-Domain-Policies `none` — retires the old Flash/PDF
              crossdomain.xml mechanism outright.
          */
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          /*
            Production only. HSTS is a one-way instruction the browser caches for a year: sending it
            over local http would pin a developer's browser to https for localhost and is painful to
            undo. No `includeSubDomains` yet — that would commit every subdomain, including any that
            a future deployment serves over http, and is worth adding once the domain is settled.
          */
          ...(isProduction
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
        ],
      },
      {
        // The staff console holds customer records; it should not be cached by any intermediary.
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
