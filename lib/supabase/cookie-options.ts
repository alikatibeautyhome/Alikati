/**
 * Cookie flags for the Supabase auth session, in one place.
 *
 * The library's defaults are permissive and the browser client was being constructed with no
 * options at all, so the session cookie went out without `Secure`. Three flags matter here:
 *
 *   • `secure`   — the cookie is only ever sent over HTTPS, so it cannot be read off a plain-http
 *                  request (a downgrade, a mis-typed `http://` link, a hostile network). Set only in
 *                  production: a Secure cookie is *not stored* over `http://localhost`, so turning
 *                  it on in development silently breaks sign-in. `NODE_ENV` is the right test —
 *                  Vercel and any `next build && next start` both report `production`.
 *
 *   • `sameSite` — `lax` rather than `strict`. Lax already blocks the cookie on cross-site form
 *                  submissions and XHR, which is the CSRF case that matters, while still sending it
 *                  on a normal top-level navigation. `strict` would break arriving at the console
 *                  from a link in an email or WhatsApp message — the user would land signed out.
 *
 *   • `path`     — `/` so both the storefront and `/admin` see the same session. The default
 *                  happens to match, but a session that is visible to the shop and not to the
 *                  console produces a bug that looks like an auth failure.
 *
 * ── What cannot be fixed here ────────────────────────────────────────────────
 * `httpOnly` stays false, and that is not an oversight. `createBrowserClient` keeps the session in a
 * cookie the *page* must read in order to attach the token to Supabase requests, so marking it
 * HttpOnly would simply break authentication. The consequence is real and worth stating plainly:
 * **any XSS on this origin can read the session token.** That is precisely why the CSP and the
 * JSON-LD escaping matter more than they otherwise would, and why moving the session to an
 * HttpOnly cookie (server-side auth only, no browser client) is the next meaningful step rather
 * than a nice-to-have.
 */
export const AUTH_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as const;
