# Alikati Beauty Home — Web Platform

Salon, bridal studio, beautician academy **and beauty shop** at Mahendranagar Road, Attariya
Chowk, Kailali, Nepal.

A complete booking + retail platform: a public storefront and booking site, plus one admin
console that controls everything — appointments, services, academy leads, media, **products,
stock, orders and customers**.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS · Supabase
(PostgreSQL, Auth, Storage) · WhatsApp deep-links.

---

## 1. Quick start (no Supabase needed)

The site ships with **demo mode**. With no environment variables set, every screen renders
from a bundled seed store — 16 services, 3 courses, 8 gallery items, a booking queue,
**21 product SKUs across 6 categories and a seeded order book** — so the whole platform,
including placing and fulfilling real orders, can be reviewed before any backend exists.

```bash
npm install
npm run dev            # http://localhost:3000
```

| Surface | URL | Notes |
|---|---|---|
| Storefront | `http://localhost:3000/shop` | Catalogue, product pages, cart, checkout, order tracking |
| Salon site | `http://localhost:3000/` | Landing, services, academy, portfolio, contact |
| Admin console | `http://localhost:3000/admin` | Redirects to `/login`; sign in with the demo credentials below |

**Demo credentials:** `admin@alikati.demo` / `demo1234` (also shown on the login screen).

Demo mode caveats — worth knowing before you evaluate it:

- Mutations (bookings, orders, stock, status changes, price edits, uploads) live in memory for
  the life of the server process. Restarting the server resets everything to the seed.
- Uploaded images are previewed via an object URL; nothing is stored.
- Session state is a `localStorage` flag, not a real JWT.
- `appointments` and `orders` seeded rows are dated relative to today, so the dashboards always
  have content.
- Orders you place in the storefront **do** appear in the admin orders screen, because both run
  in the same Node process — but a browser reload of the admin console re-reads the same store,
  so the demo stays coherent. (With Supabase configured, this is real persistence.)

Connect Supabase to replace all of that with real, persistent storage.

---

## 2. Connecting Supabase

### 2.1 Create the project and apply the schema

```bash
# 1. Create a project at https://supabase.com/dashboard, then:
cp .env.example .env.local          # fill in the three Supabase values

# 2a. If you use the Supabase CLI (recommended):
npx supabase link --project-ref <your-project-ref>
npx supabase db push                # applies supabase/migrations/*.sql in order

# 2b. Or paste these into the SQL editor, in order:
#     supabase/migrations/20260928000001_schema.sql
#     supabase/migrations/20260928000002_rls.sql
#     supabase/migrations/20260928000003_storage.sql
```

`supabase/seed.sql` mirrors the demo content — run it only against a development project.

### 2.2 Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key — RLS-constrained by design |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Accurate slot availability + booking writes that bypass RLS |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical URL for metadata, sitemap, JSON-LD |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | public | Fallback WhatsApp number (digits only) |
| `NEXT_PUBLIC_PHONE` | public | Fallback voice number |
| `BOOKING_RATE_LIMIT_PER_MIN` | server | Booking requests per IP per minute (default 5) |

Setting **both** Supabase public variables switches the app out of demo mode. Leave them
blank to stay in demo mode.

> ⚠️ Never prefix the service-role key with `NEXT_PUBLIC_`, and never import
> `lib/supabase/server.ts`'s `createAdminClient()` into a client component.

### 2.3 Create the staff accounts

1. Supabase Studio → **Authentication → Users → Add user** (use a real staff email).
2. A `profiles` row is created automatically by the `trg_on_auth_user_created` trigger with
   role `staff`. Promote the owner to admin:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'owner@alikatibeautyhome.com';
```

Roles: `admin` manages prices, settings, staff and media deletion; `staff` runs the daily
queue, walk-ins, leads and uploads.

---

## 3. What's in the box

```
app/
├── (public)/            # Public site: landing, services, academy, portfolio, contact
│   └── shop/            # Storefront: catalogue, product detail, cart, checkout, order, tracking
├── (admin)/
│   ├── admin/           # Guarded console: dashboard, appointments, services, leads, gallery,
│   │                    #   orders, products, categories, customers, settings
│   └── login/           # /login — outside the guard so it cannot redirect to itself
├── api/
│   ├── booking/         # POST /api/booking, GET /api/booking/slots
│   └── orders/          # POST /api/orders (checkout), GET /api/orders (status lookup)
├── layout.tsx           # Fonts, metadata, static BeautySalon JSON-LD
├── sitemap.ts, robots.ts, not-found.tsx, globals.css
components/
├── public/              # Header, footer, hero, service card/catalog, booking modal, sliders, forms
├── shop/                # CartProvider, ProductCard, ShopCatalog, AddToCartPanel, CheckoutForm,
│                        #   CartLines, OrderConfirmation, TrackOrderForm, FeaturedProducts
├── admin/               # Sidebar, KPI tile, appointment row, service/walk-in/product modals,
│                        #   upload dropzone
└── ui/                  # Button, Input, Textarea, Select, Label/Field, Card, Badge, Table, Modal
lib/
├── api.ts               # SERVER salon reads (server components + route handlers)
├── api-client.ts        # BROWSER admin access (client components)
├── shop-api.ts          # SERVER commerce reads
├── shop-admin-api.ts    # BROWSER commerce admin access
├── commerce.ts          # Order status maps, pricing/stock helpers, cart totals, aggregates
├── cart.ts              # Cart line maths + localStorage (de)serialisation
├── demo-data.ts         # Salon seed store powering demo mode
├── demo-commerce.ts     # Product/order seed store powering demo mode
├── supabase/            # client.ts, server.ts, middleware.ts, config.ts
├── utils.ts             # NPR formatting, slot generation, status maps, phone helpers
└── whatsapp.ts          # Every WhatsApp message template
supabase/migrations/     # 0001 schema → 0002 RLS → 0003 storage → 0004 ecommerce → 0005 shop RLS
scripts/generate-og-image.mjs
```

### Routes

| Route | Mode | Auth | Purpose |
|---|---|---|---|
| `/` | ISR 60s | public | Landing: hero, featured services, academy teaser, reviews |
| `/services` | dynamic | public | Full catalogue + booking modal |
| `/academy` | ISR 300s | public | Courses, syllabus, lead capture |
| `/portfolio` | ISR 300s | public | Filterable gallery with before/after sliders |
| `/contact` | ISR 300s | public | Map, hours, tap-to-call, WhatsApp |
| `/shop` | dynamic | public | Storefront catalogue with filters, search and sort |
| `/shop/[slug]` | ISR 300s | public | Product detail, variants, add to cart, related items |
| `/cart` | static | public | Editable cart + order summary |
| `/checkout` | static | public | Delivery + payment + order placement |
| `/order/[reference]` | dynamic | public | Order confirmation and status timeline |
| `/track-order` | dynamic | public | Look up an order by reference + phone |
| `/login` | static | public | Staff sign-in |
| `/admin/*` | client | staff JWT | Operations console (salon **and** shop) |
| `/api/booking` | dynamic | public | Validated booking + WhatsApp hand-off link |
| `/api/booking/slots` | dynamic | public | Server-computed slot availability |
| `/api/orders` | dynamic | public | `POST` places an order, `GET` looks one up |

### Booking flow

1. Client picks a service → the modal asks the date.
2. `GET /api/booking/slots?date=…&duration=…` returns free 30-minute intervals. Occupancy is
   computed **server-side** because the public role has no `SELECT` policy on `appointments`.
3. `POST /api/booking` validates (name, Nepali mobile, real date, service still active),
   checks the slot again, inserts as `pending`, and returns a reference code (`ABH-XXXXXX`)
   plus a pre-filled `wa.me` link.
4. The client taps **Confirm via WhatsApp**; the salon confirms from the admin console, which
   fires its own WhatsApp notification using the same template module.

### Security model

- **RLS everywhere.** The catalogue, courses, visible media and settings are world-readable.
  `appointments` and `academy_leads` have **no** public read policy, so a booking cannot be
  read back with the anon key.
- Public inserts are pinned: `status = 'pending'` and `is_walk_in = false`, so a client cannot
  self-confirm or forge a counter sale.
- A partial unique index on `(booking_date, booking_time, service_id)` for live statuses
  prevents double-booking; `409` is returned when the race is lost.
- A trigger caps bookings at 3 per phone number per day.
- Storage: public CDN read, staff upload, admin-only delete, with size and MIME limits.

### The shop (products & orders)

**Catalogue.** `product_categories` → `products`. Each product carries list price, an optional
promotional price, an optional cost price (for margin reporting), stock on hand, a low-stock
threshold, tags, an image gallery, and display-only variant metadata (`variant_label` +
`variant_options`, e.g. Shade → Rosewood / Coral). One SKU per product in v1.

**Checkout.** The customer's cart lives in `localStorage` and is treated purely as a
convenience cache. `POST /api/orders` validates the request, then calls the `place_order()`
Postgres function, which:

1. locks each product row and re-reads the **authoritative** price (the client cannot set it),
2. refuses the order if a product is inactive or stock is insufficient,
3. computes shipping from the settings threshold (free above `free_shipping_threshold_npr`),
4. writes the order plus `order_items` with a **price snapshot**, and
5. decrements stock in the same transaction.

`place_order()` is `SECURITY DEFINER` with `EXECUTE` revoked from `anon` and `authenticated`,
so orders can only be created by the server using the service-role key. Cancelling an order
calls `cancel_order()`, which returns the reserved stock to the catalogue.

**Payment.** v1 records the chosen method (cash on delivery, bank transfer, eSewa, Khalti) and
the amount, and hands off to WhatsApp for confirmation — there is no card gateway wired in.
`payment_status` is toggled manually in admin, except that delivering a COD order marks it paid.

**Admin shop panels** (`/admin`):

| Screen | What the admin controls |
|---|---|
| Orders | Filter by status/search/date, advance `pending → confirmed → packed → shipped → delivered`, cancel (stock restored), mark paid/unpaid, view line items and address, send a WhatsApp status update |
| Products | Full CRUD, active/featured toggles, price + promotion + cost/margin, stock adjust (−1/+1, bulk restock, write-offs), low-stock visibility |
| Categories | CRUD with display order, per-category product counts, active toggle |
| Customers | Derived from orders — spend, order count, last order, click-to-call, per-customer order history |
| Dashboard | Orders today, revenue today, pending, awaiting fulfilment, low stock, units sold this month + "needs attention" lists |
| Settings | Store on/off, shipping fee, free-delivery threshold, COD/bank-transfer toggles, payment instructions, support email, delivery note |

---

## 4. Scripts

```bash
npm run dev            # development server
npm run build          # production build
npm run start          # serve the production build
npm run typecheck      # tsc --noEmit
node scripts/generate-og-image.mjs   # regenerate public/media/og-image.png
npx supabase db reset  # local stack: migrations + seed
```

---

## 5. Before you go live

1. **Replace the placeholders.** Swap `public/media/placeholder-*.svg` for real photography
   (and regenerate or replace `og-image.png` at 1200×630).
2. **Set the real business details** in `/admin/settings`: phone, WhatsApp number (digits
   only, e.g. `9779XXXXXXXX`), address, opening/closing times.
3. **Load the real price list** in `/admin/services`. Use `discount_price_npr` for festival
   promotions — never overwrite `price_npr`, so original prices stay visible and historical
   booking amounts stay accurate.
4. **Create the staff accounts** and promote the owner to `admin` (§2.3).
5. **Set `SUPABASE_SERVICE_ROLE_KEY`** in production, otherwise slot availability is returned
   unverified (`available: false`) and the UI labels it provisional.
6. **Run the RLS test matrix** from the technical documentation (§14.1) against the anon key.
7. **Load the real product list** in `/admin/products` (name, SKU, category, price, cost,
   stock, images). Set `low_stock_threshold` per product so the dashboard warns you early.
8. **Set the store rules** in `/admin/settings` → Store & checkout: shipping fee,
   free-delivery threshold (`0` = always free), which payment methods to offer, and the
   payment instructions customers will read at checkout.
9. **`SUPABASE_SERVICE_ROLE_KEY` is mandatory for online ordering.** Without it the checkout
   endpoint returns `503` by design rather than writing an unverified order.
10. Deploy (e.g. Vercel), point the domain at it, then verify one real booking **and** one real
    order end to end on an Android device — including that both WhatsApp links open the salon's
    chat, not a preview, and that the order appears in `/admin/orders` with stock deducted.

---

## 6. Known limitations

- **Rate limiting is per instance** (in-memory `Map` in `app/api/booking/route.ts`). Move it to
  Redis/KV if you ever run more than a couple of instances.
- **Demo mode does not persist.** It exists for review, not for taking real bookings.
- **`/login` renders client-side** (it reads `?next=`, which requires a Suspense boundary on a
  static route). The form appears after hydration.
- **Availability is slot-level, not staff-level.** Two staff can serve two clients in the same
  30-minute window only if the services differ; there is no per-stylist calendar in v1.
- Seeded demo rows are dated relative to "today" in Asia/Kathmandu, so the dashboards always
  show activity.
- **One SKU per product.** `variant_options` are display-only — picking "Rosewood" does not
  decrement separate stock. Per-variant inventory is the next migration when the shop needs it.
- **No online payment gateway.** eSewa/Khalti/bank transfer are recorded and confirmed over
  WhatsApp; card or wallet capture needs merchant credentials and a webhook handler.
- **Order lookup is reference + phone**, not an account. There is no customer login or saved
  address book in v1.
- **Order rate limiting is per instance** (in-memory `Map` in `app/api/orders/route.ts`), same
  caveat as bookings.

---

## 7. Supplier catalogue import

The shop catalogue was seeded from the two supplier storefronts:

| Source | Platform | Imported |
|---|---|---|
| `colorpluscosmetics.com` | WooCommerce public Store API | 150 products |
| `welltencosmetic.com` | OpenCart (HTML) | 19 products (the whole visible catalogue) |

Both suppliers publish prices in **NPR**, so nothing is converted or guessed.

```bash
npm run import:catalog                       # default limits (150 + 80)
node scripts/import-supplier-catalog.mjs --colorplus=400 --wellten=100
node scripts/import-supplier-catalog.mjs --demo-limit=60
```

The importer writes three files:

| File | Purpose |
|---|---|
| `data/imported-catalog.json` | The full normalised catalogue (audit trail / re-import) |
| `data/demo-catalog.json` | A small slice bundled into demo mode so the browser payload stays small |
| `supabase/seed-catalog.sql` | Idempotent `INSERT … ON CONFLICT (slug) DO NOTHING` for production |

Product ids are deterministic (derived from the source and its product id), and the SQL is
idempotent, so **re-running never duplicates rows and never overwrites prices you have since
edited in admin**.

> ⚠️ **Images are hot-linked from the suppliers' CDNs**, and `next.config.mjs` whitelists those
> hosts for that reason. Before launch, either confirm you are entitled to use them as a
> reseller, or upload your own photography through `/admin/products` and switch the URLs over.
> Supplier prices also change — treat the imported figures as a starting point to confirm.

To load the full catalogue into Supabase, run `supabase/seed-catalog.sql` after the migrations
(`npm run supabase:reset`, or paste it into the SQL editor).

---

## 8. Customer accounts

Shoppers can create an account, but **nothing is gated**: browsing, the cart and guest checkout
all work without one. Account screens live under `/account` — deliberately separate from
`/login`, which is the **staff** sign-in for the admin console.

| Route | Purpose |
|---|---|
| `/account/signup` | Create an account (name, email, Nepali mobile, password) |
| `/account/login` | Sign in (honours a safe `?next=` redirect) |
| `/account` | Profile (name, phone, default address/city) and order history |

- **Demo credentials:** `sita@alikati.demo` / `demo1234` — Sita's phone matches a seeded order, so
  the order history is populated.
- A signed-in customer gets their details prefilled at checkout and their orders attached to
  `orders.customer_id`. Guests keep `customer_id = NULL` and can still track an order from
  `/track-order` with their reference and phone number.
- RLS means a customer can read **only their own** profile and orders; the storefront customer
  table is entirely separate from staff `profiles`, so a shop account can never reach `/admin`.

---

## 9. Admin account

The owner's admin account is created with the service-role key:

```bash
node scripts/create-admin.mjs --email=alikatibeautyhome@gmail.com \
  --password='<choose-a-strong-password>' --name="Nirmala Khadka"
```

This creates the auth user (email pre-confirmed), re-runs safely if the account exists (it
updates the password instead), and upserts a `profiles` row with `role = 'admin'` — which is what
unlocks pricing, settings, staff management and media deletion. Requires
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

**Demo admin login** (no Supabase needed): `admin@alikati.demo` / `demo1234`.

> The password is never written to a file in this repository — this repo is **public**. Keep it in
> a password manager, and change it from the Supabase dashboard after the first sign-in.

---

## 10. Deployment

The app is a standard Next.js project, so Vercel is the shortest path:

1. Push the repository to GitHub (see §11).
2. In Vercel: **Add New → Project → import `alikatibeautyhome/Alikati`**. The framework is
   detected automatically; `vercel.json` pins the `sin1` (Singapore) region, the closest to Nepal.
3. Add the environment variables from `.env.example`. All four Supabase/URL variables plus
   `SUPABASE_SERVICE_ROLE_KEY` are required for live bookings and orders — without the service
   role key, checkout returns `503` by design, and slot availability is reported as provisional.
4. Apply the migrations to your Supabase project (`supabase db push`, or run the five files in
   `supabase/migrations/` in order), then optionally load `supabase/seed.sql` and
   `supabase/seed-catalog.sql`.
5. Create the admin account (§9), then verify one real booking and one real order end to end —
   including that both WhatsApp links open the salon's chat.
6. Point the domain at the deployment and set `NEXT_PUBLIC_SITE_URL` to that exact origin so
   metadata, the sitemap and structured data stay correct.

Any Node host works (Netlify, Railway, a VPS with `npm run build && npm run start`). Supabase is
the only hard external dependency.

---

## 11. Pushing to GitHub

```bash
cd alikati-beauty-home
git init
git add .
git commit -m "Alikati Beauty Home — salon booking + e-commerce platform"
git branch -M main
git remote add origin https://github.com/alikatibeautyhome/Alikati.git
git push -u origin main
```

The remote already exists and its default branch is `main`, so no `-f` is needed on a first push
of a new branch.

**Authentication.** Git needs a credential for `github.com/alikatibeautyhome`. Either:

- **HTTPS + Personal Access Token** — GitHub → Settings → Developer settings →
  Personal access tokens → *Fine-grained token*, scoped to this repository with
  **Contents: Read and write**. When git prompts, use the token as the password
  (or embed it: `https://<token>@github.com/alikatibeautyhome/Alikati.git` — never commit a URL
  containing a token).
- **SSH** — add a deploy key to the repo and use
  `git@github.com:alikatibeautyhome/Alikati.git` as the remote.

`.gitignore` already excludes `node_modules`, `.next`, and every `.env*` file except
`.env.example`, so no secrets or build output are committed.

### Script reference

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run import:catalog` | Re-import the supplier catalogues |
| `npm run generate:og` | Regenerate `public/media/og-image.png` |
| `npm run create:admin` | Create or promote an admin account |
| `npm run supabase:reset` | Local stack: migrations + seed |

---

## 12. Storefront experience features

| Feature | Behaviour | Owner control |
|---|---|---|
| **Shop-first landing page** | Sections render in the order stored in `salon_settings.home_section_order` — seeded `products → services → academy → portfolio → reviews`, so the shop sits directly under the hero. Unknown keys are ignored and missing keys appended, so a bad value can never blank the page. | `/admin/settings` → Landing page sections (reorder + hide) |
| **Horizontal services rail** | The landing-page services section is a touch-friendly snap carousel (`min-w-[78%] sm:min-w-[46%] lg:min-w-[31%]`), with arrows that appear only when there is overflow. `/services` keeps its filterable grid, plus a "Most booked" rail. | — |
| **Dark & light mode** | Token-driven: `charcoal`, `cream`, `blush` and `rose-tint` are CSS variables, so `.dark` re-themes the whole app at once. A pre-paint script sets the class before React hydrates, so there is no white flash, and the mobile browser chrome follows via `theme-color`. Choice persists in `localStorage` (`abh-theme`) and defaults to the OS preference. | Toggle in the site header and the admin sidebar |
| **Cookie notice** | "Accept all" or "Essential only" — the choice is stored in `localStorage` **and** a first-party cookie, and "Essential only" genuinely skips analytics. | `/admin/settings` → Cookie notice (on/off + wording) |
| **Install app prompt** | `app/manifest.ts` + `public/sw.js` make the site a real installable PWA (standalone window, brand icons, offline fallback). Android/Chrome get a one-tap install via `beforeinstallprompt`; iOS Safari gets Share → Add to Home Screen instructions, because Apple exposes no install API. The prompt waits 9s, waits for the cookie choice, and stays quiet for 14 days after "Not now". | `/admin/settings` → Install prompt (on/off + wording) |
| **Coupon codes** | `WELCOME10`, `DASHAIN20`, `FLAT200`, `FREESHIP` seeded. Percent or fixed, with minimum spend, max-discount cap, total and per-customer limits, and a validity window. Validated server-side in `place_order()`; the checkout preview is advisory only. | `/admin/coupons` (full CRUD + usage) |
| **Affiliate programme** | Referral links (`?ref=CODE`, remembered for 60 days), commission on the product subtotal, applications reviewed by the salon. Customers apply at `/affiliate`; links are tracked through to the order and credited automatically. | `/admin/affiliates` (approve, rate, payouts) |

### Honest limits

- **A website cannot install itself.** Browsers require a user gesture, and iOS Safari exposes no
  install prompt at all. The one-tap install and the iOS instructions above are the maximum any
  site can do; "automatic install" is not a thing on the web.
- Coupon and affiliate previews are advisory: `place_order()` re-reads the coupon and recomputes
  every figure, so a tampered request cannot invent a discount.
- Commission is credited when the order is placed, not when it is paid. If you want
  commission-on-delivery, that is a follow-up: reverse `commission_npr` when an order is cancelled.

---

## 13. Supabase integration — verified, not assumed

The schema, the RLS policies and the server-side business rules were executed against a **real
PostgreSQL 16 database** for the first time on 2026-09-28, using a Supabase environment shim so
no Docker or hosted project was needed. Ten migrations, 49 assertions, all passing.

```bash
npm run test:db          # creates a throwaway DB, applies every migration, runs the suite
```

### Running this validation yourself

Requires PostgreSQL 14+ (`apt-get install postgresql postgresql-contrib`). The script drops and
recreates a database named `alikati_test` and touches nothing else:

```bash
bash supabase/local/run-local-tests.sh
```

What it proves:

| Area | Assertions |
|---|---|
| Schema | 14 tables exist; RLS enabled on all 14 |
| Privileges | `place_order`, `preview_coupon`, `cancel_order`, `shop_kpis` are **not** callable with the public anon key; `service_role` retains the two it needs |
| Order engine | promotional prices used, coupon applied with cap, shipping threshold, stock reserved, coupon consumed, affiliate credited, overselling refused, absurd quantities clamped, empty cart refused |
| Cancellation | restores exactly the reserved units; refuses a non-staff caller |
| Coupons | `preview_coupon()` caps and rejects unknown/expired/below-minimum codes |
| Bookings | velocity guard blocks the 4th same-phone/date booking; walk-ins bypass it |
| Signup | customer signup → customer row only; staff invite → staff row only |
| RLS (anon) | cannot read orders/items/appointments/customers/leads/coupons/affiliates, cannot insert orders, cannot change a price, delete a product, deactivate a service, or self-promote to admin — but **can** read the catalogue and settings, book an appointment, and apply to the affiliate programme |
| RLS (staff) | can read orders, appointments, coupons, customers; can approve affiliates, adjust stock, upload media |

### Three defects this found — all fixed

1. **`place_order()` could not be created** (0008). It returns four new columns, and PostgreSQL
   refuses to change an OUT-parameter row type through `CREATE OR REPLACE`. `supabase db push`
   would have failed outright. Fixed with an explicit `DROP FUNCTION IF EXISTS` — see the comment
   in migration 0008.
2. **`preview_coupon()` was broken at runtime** (0008). Its OUT parameter `code` collided with
   `coupons.code`, raising `column reference "code" is ambiguous`, so every coupon check failed.
   Fixed by aliasing the table.
3. **🔴 CRITICAL — every customer signup became staff.** `handle_new_staff_user()` fired on *all*
   `auth.users` inserts and unconditionally created a `profiles` row with role `staff`, so
   `is_staff()` — the key every RLS policy turns on — returned true for anyone who registered at
   `/account/signup`. Verified live before the fix: a freshly registered account could read all
   orders (customer names, phones, delivery addresses), read the customer list, and change
   product prices. Fixed in migration **0010**.

Migration **0009** hardens the privileged RPCs: PostgreSQL grants `EXECUTE` to `PUBLIC` on every
new function, so the original `REVOKE … FROM anon, authenticated` was ineffective — `anon` could
still call `place_order()`, `preview_coupon()` (coupon enumeration), `cancel_order()` and
`shop_kpis()` (revenue) straight through PostgREST. Now revoked from `PUBLIC` and re-granted
narrowly, with an internal `is_staff()` guard inside `cancel_order()` and `shop_kpis()` as
defence in depth.

### ⚠ Staff invitations

A profile is now created **only** when the signup declares a staff role. Inviting someone from
the Supabase dashboard without adding metadata will not give them console access. Use:

```bash
node scripts/create-admin.mjs --email=... --password='...' --name="..."
```

or add `{ "role": "staff" }` to the user's metadata in the dashboard.

### Applying to a hosted project

1. Create the project at supabase.com, then from the repo:
   `supabase link --project-ref <ref> && supabase db push`
   (or paste the files in `supabase/migrations/` into the SQL editor, in filename order).
2. Copy the Project URL, `anon` key and `service_role` key into `.env.local`.
3. `node scripts/create-admin.mjs --email=... --password='...'`
4. Optionally load the supplier catalogue: `psql "$DATABASE_URL" -f supabase/seed-catalog.sql`
5. Re-run the suite against the real project to confirm the same guarantees hold.

---

## 14. Live Supabase project — connected, migrated and verified

**Project:** `xoygmkyrovepkesxvjij` · **Region:** Tokyo (ap-northeast-1) · **Database:** PostgreSQL 17.6 (UTF8)
**State:** schema applied · catalogue loaded · admin account created · app running in live mode.

### Applied on 2026-09-28

| | |
|---|---|
| Migrations | 10 → 14 tables, 2 views, 6 enums, 12 triggers |
| RLS policies | 59, with RLS enabled on all 14 base tables |
| Storage buckets | `gallery`, `services`, `academy`, `products` |
| `salon_settings` | singleton with the real phone, email and social profiles |
| Catalogue | **169 products** in 7 categories (73 on offer, 45 brands, all with images) |
| Admin account | `alikatibeautyhome@gmail.com` (role `admin`) |

### Verified against the live database, not assumed

| Test | Result |
|---|---|
| 14 base tables + 2 views present | ✔ |
| Tables **without** RLS | 0 ✔ |
| `place_order` EXECUTE: anon ✘ / authenticated ✘ / service_role ✔ | ✔ |
| Order pricing: रू 3,500 − 350 coupon + 150 shipping = **3,300**, stock reserved, coupon counted, affiliate credited रू 280 (8%) | ✔ |
| Overselling refused | ✔ |
| RLS as `anon`: orders / coupons / customers / leads invisible; active products visible | ✔ |
| Customer signup gets **no** staff profile; staff invite gets `role = admin` | ✔ |
| Storefront reads real rows: PDP रू 795, 46 makeup items on the category filter, search hits | ✔ |
| Owner sign-in via `/auth/v1/token` | ✔ |
| Every test rolled back — 0 rows persisted | ✔ |

### Still empty — add your real content in the admin console

`services`, `academy_courses`, `gallery_items` and `appointments` hold no rows. They were
deliberately **not** seeded, because that would have put invented prices in front of your
customers. Sign in at `/login` and add them, or ask for the starter set to be loaded.

### Two bugs this exercise caught

1. **The catalogue seed crashed on your project** with `42803: column c.display_order must
   appear in the GROUP BY clause` — a defect in the seed's verification query. Fixed in
   `scripts/import-supplier-catalog.mjs` (which now also has a `--from-cache` mode so emitter
   fixes do not require re-scraping the suppliers).
2. **Public pages were being prerendered empty** in live mode. Because the server Supabase
   client touches `cookies()`, Next.js throws `DYNAMIC_SERVER_USAGE` to mark the route dynamic;
   the error-swallowing helper in `lib/api.ts` / `lib/shop-api.ts` was hiding it, so `/academy`
   was statically generated with no courses. Both helpers now re-throw that specific error.

> Note for anyone running the local suite: `supabase/local/run-local-tests.sh` creates its
> database with `-E UTF8`. A `SQL_ASCII` cluster counts `varchar` limits in *bytes* and reports
> misleading `value too long` errors for accented text.

### Revoke the credentials you shared

- **Personal access token** (`sbp_…`): revoke at https://supabase.com/dashboard/account/tokens
- **Secret key** (`sb_secret_…`): rotate at Project Settings → API (it bypasses RLS entirely)
- The legacy `anon` / `service_role` JWTs supplied earlier are **corrupt** (wrong project ref
  embedded) — discard them; `.env.local` uses the publishable/secret pair instead.

---

## 15. Owner request batch (2026-09-28) — features, review and bug fixes

### Admin access

| | |
|---|---|
| URL | `/login` (i.e. `https://<site>/login`) |
| Email | `alikatibeautyhome@gmail.com` |
| Password | set to the owner's chosen value — **only this password works**; the previous one was revoked |

Change it after signing in (Users → your row → Reset password, or Supabase → Authentication).
No credential is stored in this repository.

### The six requests

1. **Admin login** — password changed on the live project and confirmed by an actual
   `/auth/v1/token` sign-in with the new value and a rejection of the old one.
2. **Multiple accounts** — customer signup at `/account/signup` is open and unlimited. In
   addition `/admin/users` lets an administrator create further accounts (administrator, staff
   or customer), change roles, reset passwords and deactivate people. Deactivation never
   deletes the login, so order history survives.
3. **QR on the payment screen** — `components/shop/PaymentQR.tsx` renders on checkout whenever
   the chosen method is not cash-on-delivery. It shows the owner's uploaded QR if present,
   otherwise generates one from `payment_qr_content` (default `esewa:9869512756`) in the
   browser. Both are editable in Settings → Payments & QR, with a live preview.
4. **Statement upload** — the customer attaches a payment screenshot (PNG/JPG/WEBP/HEIC/PDF,
   ≤5 MB) at checkout. It lands in the **private** `payment-proofs` bucket; only the object key
   is sent to the server, and staff open it through a short-lived signed URL from the orders
   screen. A failed upload never blocks the order.
5. **WhatsApp with full order details** — the hand-off message now carries the reference, name,
   phone, address, items, subtotal, coupon discount, delivery fee, total, transaction id and a
   note when a statement is attached.
6. **Nepali dates** — every relevant surface shows Bikram Sambat with the AD date alongside
   (`12 Ashoj 2083 (2026-09-28)`): order confirmation, tracking, account history, booking
   success, and the admin dashboard, appointments, orders and coupons. Toggle in
   Settings. Dates are still **stored** as AD so sorting and expiry maths stay correct.
   Coupons gain one-tap validity presets — 7 / 10 / 15 / 30 / 60 / 90 days or no expiry — which
   compute `ends_at` automatically (`couponWindow()`), plus an expiry label such as
   "Ends in 5 days" in the list.

### Bugs found by the review, and fixed

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | `is_staff()` only checked that a `profiles` row **existed** — never the role | Any future non-staff profile row would inherit full staff reach (orders, customers, coupons, price edits) | Migration 0011 verifies `role IN ('admin','staff')` **and** `is_active` |
| 2 | The orders API read `subtotal_npr / shipping_npr / total_npr` but `place_order()` returns `subtotal / shipping / total` | Live orders returned **null totals** and the WhatsApp message rendered **"रू NaN"** | Corrected the column mapping + added a loud guard that logs non-numeric totals instead of shipping them to customers |
| 3 | `is_active` referenced before the column existed in the 0011 script | Migration aborted on a fresh database | Reordered the blocks (column first) |
| 4 | English month 6 was labelled `Ashwin` | Wrong month name in every BS date | Corrected to `Ashoj`, matching असोज |
| 5 | `bsToAd()` returned local midnight | Rendered as the **previous day** in any timezone east of UTC | Re-anchored to noon UTC; `adToBs()` now resolves the calendar day **in Kathmandu** (a 20:00Z timestamp correctly shows the next BS day) |
| 6 | The seed's verification query used `ORDER BY c.display_order` without grouping it | Aborted the whole catalogue transaction (`42803`) | Grouped the column; importer gained `--from-cache` |
| 7 | My own `run-local-tests.sh` UTF8 patch injected a quote inside a shell string | The whole local suite stopped running | Rewritten with a guarded `createdb` |

### Verification performed (all green)

- `tsc --noEmit` → **0 errors**; production build → **clean, 41 routes**
- Database suite → **all 49 assertions pass** with all 11 migrations, on PostgreSQL 16 and 14
- Route sweep → 14 public routes 200; `/admin/*` correctly 307 → `/login`
- **Security**: `/api/admin/staff` returns **401** with no token, **403** for a signed-in
  non-staff account, **200** for the real administrator
- **Storage**: anonymous upload of a PNG → 200; anonymous read → denied; public URL → denied;
  anonymous signed-URL request → denied; staff signed URL → 200 and serves the file
- **End-to-end order** through the public API with a coupon, transaction id and statement key:
  subtotal रू 810 + delivery रू 150 = total रू 960, correct in the response, in the database and
  in the WhatsApp message — then rolled back (order deleted, stock restored)
- Nothing test-related was left behind; the only order in the database is the owner's own
  `ABH-ORD-869DF5`, which was left untouched (the customer name on it is omitted here so the
  repository carries no personal details)

### Still empty on purpose

`coupons`, `affiliates`, `services`, `academy_courses` and `gallery_items` have no rows —
inventing discount codes or prices for a live shop is not something to do on the owner's
behalf. Create them in the admin console; the features are all wired and verified.

---

## 16. "We could not place your order" — root cause and fixes (2026-09-28)

### Why it happened

The server log had the answer, repeated five times:

```
[api/orders] place_order failed: insert or update on table "orders"
violates foreign key constraint "orders_customer_id_fkey"
```

The owner was signed in **as the administrator** (`alikatibeautyhome@gmail.com`) — the checkout
screen said so. A signed-in checkout sends `customer_id`, and `orders.customer_id` has a foreign
key to `customers`. But a staff/admin account has **no row in `customers`**: migration 0010
deliberately creates one only for non-staff signups, precisely so that staff never appear as
shoppers. So the id pointed at nothing, Postgres rejected the insert, `place_order()` raised, the
API returned 500 — and the form collapsed every possible cause into one unhelpful sentence.

Any signed-in staff account was unable to buy anything. It was not the phone number, not the
coupon, not the payment method, and not a temporary glitch.

### The fixes (three layers)

1. **Data** — the missing `customers` row now exists for that account, so the owner can order
   immediately. Going forward, `app/api/orders/route.ts` creates the row automatically for a
   verified signed-in user who lacks one, so the order still links to their account.
2. **Database** — migration `0012` makes `place_order()` drop an unknown `customer_id` to NULL
   instead of raising. A stale id now yields a normal guest order; it can never fail a sale.
3. **Interface** — the checkout no longer hides the reason. Each failure class has its own
   message, the raw status and body are logged for support, and nothing the customer typed is
   cleared.

| Response | What the customer now sees |
|---|---|
| `422` | The offending fields are highlighted, with the server's per-field text |
| `409` | The server's message verbatim ("we do not have enough stock of X…") |
| `429` | "Too many attempts — please wait a minute and try again." |
| `5xx` / network | "Something went wrong on our side. Your details are still here — please try again." + **Try again** |
| any failure | **"Send this order on WhatsApp instead"** — a pre-composed message with the name, phone, address, every line, subtotal, delivery, discount, total, coupon and transaction id |

### Also in this round

- **Amount-aware QR** — `payment_qr_content` accepts an `{amount}` token
  (default `esewa:9869512756?amount={amount}`), substituted with the live order total and
  re-drawn whenever the cart, coupon or delivery cost changes. The total is **always printed
  beside the code** too, because whether a wallet pre-fills the amount depends on the provider's
  QR format — a provider-validated dynamic QR needs Fonepay/eSewa merchant credentials.
- **Phone normalisation** — `+977 980-0000000`, `9779800000000`, `09800000000` and `9800000000`
  all normalise to `9800000000`, on blur and on submit, with a clear inline message otherwise.
  (The example number is fictional. A real customer's number used to sit here and was replaced, so
  that publishing this repository cannot expose anyone's details.)
- **Product images in the order views** — thumbnails beside every line item in the admin order
  detail (and a compact one in the list row), and on the customer's order confirmation. Resolved
  by product id with one cached lookup per page, falling back to the snapshot stored on the order
  line, then to a placeholder.
- **Editable landing-page hero** — upload the real salon photograph and edit the heading,
  subheading and badge text in Settings → Landing page hero. Removing the image restores the
  bundled placeholder.

### Verification

`tsc --noEmit --incremental false` → **0 errors** · production build → **clean, 41 routes** ·
database suite → **49/49 assertions pass across all 13 migrations** · every public route 200 and
`/admin/*` correctly 307 to `/login` · the failure contract still returns per-field errors ·
the owner's order page resolves its product image (confirmed in the server payload) · no server
errors logged.

> Note for future debugging: `tsc --noEmit` with `incremental: true` can report **stale** errors
> from its build cache. Use `--incremental false` when verifying, as this review does.

---

## 17. Hero slideshow (migration 0014)

The landing hero is now a rotating slideshow instead of one photograph.

### How it works

- Slides live in the `hero_slides` table — each with an image, alt text, an optional per-slide
  heading/subheading override, a display order and an active flag. A table (rather than a JSON
  blob) is what makes ordering, disabling and captions possible without rewriting a list.
- Images reuse the existing public `gallery` bucket through the same uploader the rest of the
  admin uses — no new bucket, no new storage policy.
- `salon_settings.hero_image_url` is **kept as a fallback**: with no slides the hero shows that
  single image; with neither, the bundled placeholder. The migration seeded one slide from the
  existing hero image, so nothing already configured was lost.
- Management lives in **Settings → Hero slideshow**: add, edit, reorder (up/down), activate or
  deactivate, and delete with an inline confirmation. Adding a slide never requires a developer.

### Slideshow behaviour (`components/public/HeroSlideshow.tsx`)

| Behaviour | Detail |
|---|---|
| Rotation | Every 5 s, wrapping around |
| Transition | Cross-fade, plus a subtle 7 % drift over 9 s on the visible frame |
| Photos | All slides stay mounted and decoded, so a rotation never shows an empty frame |
| Controls | Arrows from `sm` up; 44 px-tall dots always; swipe (40 px threshold) on touch |
| Pauses | On hover, on keyboard focus, and while the tab is hidden |
| Reduced motion | Autoplay and the drift are switched off entirely for `prefers-reduced-motion` |
| Single slide | Renders as a plain image — no arrows, no dots |
| Performance | Only the first image is `priority`; the rest load lazily |
| Accessibility | `role="region"` + `aria-roledescription="carousel"`, labelled dots, `aria-hidden` on inactive slides, alt text per slide |
| De-duplication | The same URL twice is filtered out, so a duplicate cannot look like a glitch |

### Verification

- `tsc --noEmit --incremental false` → **0 errors**; production build → **clean, 41 routes**
- Database suite → **49/49 assertions across all 14 migrations**
- Live: the hero renders the carousel markup with the seeded slide; routes 200; no server errors
- `supabase/apply-all.sql` regenerated — **14 migrations, 119.5 KB**

---

## 18. Landing page redesign + site-wide palette (2026-09-28)

The owner supplied a reference storefront layout and asked for its colour combination across the
whole site, with the existing hero blended into the new page.

### Palette — sampled, not guessed

The reference image was decoded and its dominant hues measured rather than eyeballed:

| Role | Colour | Where it comes from |
|---|---|---|
| Primary | **#E23D7C** | reference's dominant pink (`rose.gold` keeps its token name) |
| Accent | **#ED4080** / deep **#C21F63** | gradient mid-tones / hover and depth |
| Section tints | **#FFF2F5** (`blush`) on **#FDFBFC** | the reference's category tiles and page background |
| Prices | **#12874A** (`text-price`) | the reference's green price treatment |
| Sale badges | **#E53935** (`sale`) | the reference's red discount chips |
| Gold | **#C28A4C** | kept: the logo's crown and script are gold |

Because surfaces and tints are CSS variables and the brand hues are Tailwind tokens, changing
them re-themed the entire application — public pages, admin console and both dark/light modes —
without touching component code. Only genuinely hardcoded leftovers needed a sweep.

New gradient helpers: **`gradient-hero`** (magenta→pink banner) and **`gradient-sale`** (promo
band), each with a dark-mode variant.

### Landing page, in the reference's order

`HeroBanner` (gradient band, badge pill, headline, two CTAs, existing **slideshow** blended in,
circular "100% Original" seal) → `FeatureStrip` (4 items overlapping the hero edge) → then the
owner-controlled `home_section_order`:

```
Best Sellers → Shop by Category → promo band → services → academy → portfolio → reviews
```

then `TrustStrip` → closing CTA. The trust strip and hero are fixed; everything between them is
reorderable from Settings.

| Block | Data source |
|---|---|
| Feature strip | static copy, written for this business |
| Category tiles | live categories with **real** product counts (Skincare 93, Makeup 45, Hair Care 11 …) and a representative image |
| Promo band | `settings.promo_*` — the owner's own words; hides when disabled. The site never invents a discount claim |
| Best Sellers | live products; **ratings render only when a real `rating_average` exists** |
| Trust strip | static copy |

### Also fixed

- **`bg-amber/10` was not a valid Tailwind class** (there is no bare `amber` key), so those
  panels rendered with no background at all — now `bg-blush-100`.
- Discount badges were inconsistent (a gold badge on the product page, rose on service cards) —
  all now `bg-sale`.
- Every displayed price now uses `text-price`, with the original struck through in grey, on the
  product page, service cards, cart, checkout, order confirmation and order tracking.
- Stale warm-brown tints and old-brand hexes replaced with pink tokens across 16 files.

### Verified

`tsc --noEmit --incremental false` → **0 errors** · production build → **clean, 41 routes** ·
database suite → **49/49 assertions across all 15 migrations** · landing page renders in
document order with every reference element present (gradient hero, Shop Now / Explore CTAs,
100% Original seal, category tiles with real counts, promo band, best sellers, trust strip) ·
`text-price` and `bg-sale` present in the served HTML · routes 200 · no server errors.
