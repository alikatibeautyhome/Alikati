# Deploying to Vercel

Every step here is something only the dashboard can do. The application code is already correct for
Vercel — no filesystem writes outside `/tmp`, `sharp` pinned to the Node runtime, no background
processes — so if a deployment misbehaves, it is almost always one of the four things below.

**After any change to environment variables or Supabase settings, open `/api/health` on the
deployment.** It tells you which of these is wrong, rather than leaving you to guess.

---

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, for Production *and* Preview.
Then **redeploy** — changing a variable does not restart a running deployment, and a surprising
number of "it didn't apply" reports are exactly this.

### Required

| Variable | Public? | Where the value comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes — ships to the browser | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes — ships to the browser | …→ API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO — server only** | …→ API → `service_role` key |
| `NEXT_PUBLIC_SITE_URL` | yes | This deployment's own URL, e.g. `https://alikatibeautyhome.com`. Without it the sitemap and Open Graph tags fall back to `https://alikatibeautyhome.com`. Never point it at a preview or tunnel URL. |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | — | The number behind the floating button and "Order via WhatsApp" |
| `NEXT_PUBLIC_PHONE` | — | Displayed contact number |
| `BOOKING_RATE_LIMIT_PER_MIN` | `5` | Bookings per caller per minute |
| `REVIEW_RATE_LIMIT_PER_MIN` | `3` | Review submissions |
| `ORDER_RATE_LIMIT_PER_MIN` | `8` | Order submissions |
| `COUPON_RATE_LIMIT_PER_MIN` | `20` | Coupon validation attempts |
| `IMAGE_RATE_LIMIT_PER_MIN` | `300` | Image-pipeline requests. Raise it if a large catalogue page is ever throttled. |
| `PRODUCT_IMAGE_STRIP_WATERMARK` | — | Set to `1` only while re-importing supplier images |

### The one that is easy to get wrong

`SUPABASE_SERVICE_ROLE_KEY` **must not** be prefixed `NEXT_PUBLIC_`. That prefix is what tells Next
to inline a value into the JavaScript sent to browsers, so `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
would publish the key that bypasses every row-level security policy in the database. The naming is
the entire safeguard — nothing else stops it.

Verify it never happened:

```bash
npm run security:audit      # scans every client bundle for the service-role key
```

---

## 2. Supabase authentication URLs — the usual cause of "login just fails"

Supabase refuses sign-in from a domain it does not recognise. This is a dashboard setting, and it is
the single most common problem after moving to a new domain.

**Supabase → Authentication → URL Configuration:**

- **Site URL** — the canonical production URL.
- **Redirect URLs** — add every domain that will sign in, one per line:
  - `https://your-domain.com/**`
  - `https://your-project.vercel.app/**`
  - `https://*-your-team.vercel.app/**` — the pattern that covers Vercel **preview** deployments, which
    otherwise get a new hostname on every push and fail to authenticate
  - `http://localhost:3000/**` — for local work

A missing entry produces a redirect to the Site URL or a refusal, not an explanatory error, which is
why it reads as "Supabase is broken" rather than "this domain is not allowed".

---

## 3. The database must have the migrations

A Vercel deployment and a Supabase project are independent. Deploying the code does not change the
database, and pointing at a **new** Supabase project means starting from an empty schema.

Apply them, in order, from `supabase/apply-all.sql` — it concatenates every migration and is safe to
run end to end. Either paste it into the Supabase SQL editor, or:

```bash
# with the Supabase CLI linked to the project
supabase db push
```

`/api/health` reports precisely which tables or functions are missing if this step is incomplete.

---

## 4. Verify

```
https://your-domain.com/api/health
```

- **`status: "ok"`** — everything required works.
- **`status: "ok_with_warnings"`** — required checks pass; read the warnings.
- **`status: "unhealthy"` with HTTP 503** — something required is broken, and the failing entry says
  which and usually what to do.

Then check the storefront itself: the homepage, `/shop`, and one product page. Product images are
served through `/api/product-image`, which fetches and re-canvases each one — if images are missing
but the rest of the page is fine, that route is the place to look, and its server logs will say why.

---

## 5. Common symptoms and what they actually mean

| Symptom | Almost always |
|---|---|
| The whole site is demo data | `NEXT_PUBLIC_SUPABASE_URL` or the anon key is unset — the app falls back to bundled demo content rather than crashing. `/api/health` names the missing variable. |
| Admin sign-in does nothing | The deployment's domain is not in Supabase's Redirect URLs (§2). |
| Signed in but the console is empty | The account has no row in `profiles`, or its `role` is not `admin`/`staff`, or `is_active` is false. Row-level security is doing its job, not failing. |
| Images broken, rest of the page fine | `/api/product-image` — check the deployment's function logs. |
| Requests to Supabase fail from the browser only | `connect-src` in the CSP. It lists `https://*.supabase.co`; a self-hosted Supabase on another domain must be added in `next.config.mjs`. |
| Changes to a variable had no effect | Not redeployed (§1). |

---

## 6. Before going live

```bash
npm run build            # must pass
npm run security:audit   # 7 checks, all should pass
npm run security:restore-test   # proves the backup restores
```

Turn on **two-factor authentication** for every staff account at `/admin/security`. The console can
read every customer's name, phone and address, so a password alone is the weakest link left.

And note what is *not* automated: Supabase's own backup schedule, and whether anyone has tested it.
`security:restore-test` proves the rows are recoverable; the platform backup is a separate thing and
worth checking is enabled on your plan.
