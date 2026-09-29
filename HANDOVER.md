# Alikati Beauty Home — Handover

Everything needed to keep building this platform on a **new Supabase account**.

**Salon, bridal studio, academy and beauty shop** · Mahendranagar Road, Attariya Chowk, Kailali, Nepal
**Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind 3 · Supabase (PostgreSQL, Auth, Storage)

---

## 1. What's in the box

| | |
|---|---|
| Source files | 133 TypeScript/TSX/script files, ~28,000 lines |
| Database | 15 migrations · 16 tables, 2 views, 6 enums, 59 RLS policies |
| Migrations | `supabase/migrations/` (also bundled into one file: `supabase/apply-all.sql`) |
| Public pages | 24 routes |
| Admin pages | 13 screens |
| Tests | 49 database assertions (`npm run test:db`) |

### State of the live project at handover

| | |
|---|---|
| Products | 169 across 7 categories (imported from two supplier catalogues) |
| Hero slides | 5 |
| Coupons | 1 |
| Orders | 1 (the owner's own test order — left untouched) |
| Customers | 2 · Staff accounts 1 |
| Services / courses / gallery | **0 — deliberately not seeded** (inventing prices for a live shop is not acceptable) |

---

## 2. Run it locally in 60 seconds (no database needed)

```bash
npm install
npm run dev          # http://localhost:3000
```

With **no environment variables**, the app runs in **demo mode** on bundled seed data — the whole
platform works, including placing orders. Admin: `/login` with `admin@alikati.demo` / `demo1234`.
Demo mode holds everything in memory; restarting the server resets it.

---

## 3. Moving to a NEW Supabase account — step by step

### 3.1 Create the project

1. https://supabase.com/dashboard → **New project**
2. **Region: `ap-northeast-1` (Tokyo)** — closest to Nepal, and what the current project uses.
3. Save the **database password** somewhere safe. You need it for the CLI route in 3.4.

### 3.2 Collect three values

**Project Settings → Data API** and **Project Settings → API keys**:

| Value | Where | Goes into |
|---|---|---|
| Project URL (`https://<ref>.supabase.co`) | Data API | `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable** key (`sb_publishable_…`) | API keys | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Secret** key (`sb_secret_…`) | API keys | `SUPABASE_SERVICE_ROLE_KEY` |

> The **publishable** key is safe in the browser. The **secret** key bypasses every RLS policy —
> server-side only, never commit it, never expose it to a client component.

### 3.3 Apply the schema — pick ONE route

**Route A — SQL editor (fastest, no tooling)**

1. Dashboard → **SQL Editor** → New query
2. Paste the entire contents of **`supabase/apply-all.sql`**
3. Run. It bundles all 15 migrations in order, inside one transaction, and refuses to start on a
   project that already has the schema. Expect ~20 seconds.

**Route B — Supabase CLI**

```bash
supabase link --project-ref <new-ref>     # asks for the database password
supabase db push                          # applies supabase/migrations/ in order
```

The applied versions are already recorded in `supabase_migrations.schema_migrations`, so the CLI
knows what has been done and will only apply genuinely new migrations.

### 3.4 Configure the app

```bash
cp .env.example .env.local     # then fill in the three values from 3.2
npm run dev                    # the app switches from demo mode to live data automatically
```

`isDemoMode()` in `lib/supabase/config.ts` is simply "are those two public values set?" —
so an empty value means demo mode, nothing else to toggle.

### 3.5 Create the owner's admin account

```bash
node scripts/create-admin.mjs \
  --email=you@example.com \
  --password='choose-a-strong-one' \
  --name="Nirmala Khadka"
```

**Why not just sign up?** `handle_new_staff_user()` (migration 0010) creates a `profiles` row
**only** when the signup explicitly declares `role: admin|staff` in its metadata. This single rule
is what stops any shopper from becoming staff — it was a live privilege-escalation bug before
0010, so do not "simplify" it.

If you invite staff from the Supabase dashboard instead, add `{"role":"staff"}` to their
**user metadata** or they will have no console access.

### 3.6 Optional — load the product catalogue

```bash
psql "$DATABASE_URL" -f supabase/seed-catalog.sql      # 169 products, 7 categories
```

Regenerate it any time with `npm run import:catalog` (re-scrapes the two supplier sites) or
`node scripts/import-supplier-catalog.mjs --from-cache` (rebuilds from
`data/imported-catalog.json` without any network calls).

---

## 4. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for live mode | Project URL. **Empty ⇒ demo mode.** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for live mode | Publishable key (browser-safe, RLS-constrained) |
| `SUPABASE_SERVICE_ROLE_KEY` | for checkout | Secret key. **Without it the checkout returns 503** rather than writing an unverified order |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URL for metadata, sitemap, Open Graph |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | optional | Fallback if `salon_settings` has no number |
| `NEXT_PUBLIC_PHONE` | optional | Fallback voice number |
| `BOOKING_RATE_LIMIT_PER_MIN` | optional | Booking API requests per IP per minute (default 5) |

`.env.local` is gitignored. **Your GitHub repo is public** — never commit real keys, and keep them
in `.env.local` or your host's environment settings.

---

## 5. Commands

```bash
npm run dev              # development server
npm run build            # production build
npm run start            # serve the production build
npm run typecheck        # tsc --noEmit
npm run test:db          # apply all migrations to a throwaway DB and run 49 assertions
npm run supabase:sql     # regenerate supabase/apply-all.sql from the migrations folder
npm run import:catalog   # re-import the two supplier catalogues
npm run generate:og      # regenerate the social-share banner
npm run generate:icons   # regenerate PWA icons from the logo
npm run create:admin     # create/update an admin or staff account
```

`npm run test:db` needs PostgreSQL installed locally (14+). It creates and drops a database
called `alikati_test` and touches nothing else — it validates the schema, the business rules
(order pricing, stock reservation, coupons, affiliate commission) and the RLS policy matrix.

---

## 6. Feature inventory

### Storefront
Shop with category/search/sort filters · product pages with variant choice · cart · checkout
(COD / bank / eSewa / Khalti, QR payment, transaction ID, payment-statement upload) · order
confirmation + tracking by reference & phone · customer accounts (signup, login, order history)
· affiliate programme with referral links · salon service booking with live slot availability ·
academy courses + enquiry form · portfolio with before/after slider · contact page · WhatsApp
deep links everywhere · PWA install prompt · cookie notice · privacy page · dark & light mode ·
Nepali (Bikram Sambat) dates alongside AD.

### Admin console (`/admin`)
Dashboard KPIs · appointments (table + board, status pipeline, WhatsApp notifications, walk-ins)
· services & prices · academy leads CRM · media gallery · **products** (full CRUD, stock, pricing,
promotions, images, optional ratings) · **categories** · **orders** (fulfilment pipeline, payment
reference, statement viewer, product thumbnails) · **customers** · **coupons** (percent/fixed, caps,
usage limits, 7/10/15/30/60/90-day presets, Nepali dates) · **affiliates** (approve, suspend,
pay out) · **users** (create admin/staff/customer, change role, reset password, deactivate) ·
settings (store rules, shipping, payment QR, promo band, hero slideshow, social links, contact
details, homepage section order, cookie/install prompts).

---

## 7. How the data is protected

Authorization is enforced **in the database**, not in the UI.

| Rule | Where |
|---|---|
| Public can read the active catalogue, courses, visible media, settings | RLS policies, `20260928000002_rls.sql` |
| Public can create a pending booking or a new lead — nothing else | RLS `WITH CHECK` clauses |
| Orders and customers are **never** publicly readable | no public SELECT policy exists |
| A customer sees only their own orders | `orders` policy keyed on `auth.uid()` |
| Staff reach requires a `profiles` row with `role in ('admin','staff')` **and** `is_active` | `is_staff()` / `is_admin()` |
| `place_order()` recomputes every price and reserves stock under a row lock | `place_order()` is `SECURITY DEFINER` |
| Privileged RPCs are unreachable from clients | EXECUTE revoked from `PUBLIC`, granted to `service_role` only |
| Payment screenshots are private | `payment-proofs` bucket is not public; staff read via signed URLs |

Prove it any time: `npm run test:db` asserts all of the above, including that a customer signup
gets **no** staff profile and that an anonymous session cannot read orders, customers or coupons.

---

## 8. Not done / deliberate limitations

- **No payment gateway.** COD, bank transfer, eSewa and Khalti are *recorded* and confirmed on
  WhatsApp. A provider-validated dynamic QR (Fonepay/eSewa merchant) needs merchant credentials.
  The QR currently encodes `payment_qr_content` with `{amount}` substituted — whether a wallet
  pre-fills that amount depends on its QR format, which is why the total is also printed.
- **One SKU per product.** `variant_options` are display-only; shading/sizing does not decrement
  separate stock.
- **Supplier images are hot-linked** from `colorpluscosmetics.com` and `welltencosmetic.com`.
  Confirm you are entitled to them, or upload your own through the console.
- **Affiliate commission is credited when an order is placed**, not when it is delivered.
- **Services, courses and gallery are empty** — add the real ones.
- **Not deployed.** The live preview is a temporary Cloudflare tunnel. For production: push to
  GitHub, import into Vercel, add the env vars, and set the domain.
- **The repo exists but is empty** — the push needs a credential (see §9).

---

## 9. Remaining setup tasks

```bash
# 1. Push the code (needs a PAT with Contents: Read and write on that repo)
git remote add origin https://github.com/alikatibeautyhome/Alikati.git
git push -u origin main

# 2. Deploy: vercel.com/new → import the repo → add the env vars from §4
```

---

## 10. Troubleshooting — real errors hit while building this

| Symptom | Cause | Fix |
|---|---|---|
| "We could not place your order" with no detail | A signed-in **staff** account has no `customers` row, so `orders.customer_id` violated its foreign key and `place_order()` raised | Fixed twice over: the API creates the missing row, and migration 0012 degrades an unknown id to a guest order. The checkout now shows the real reason |
| `column reference "code" is ambiguous` | A function's OUT parameter collided with a column name | Alias the table in the query (migration 0008) |
| `cannot change return type of existing function` | `CREATE OR REPLACE` cannot change an OUT-parameter row type | `DROP FUNCTION` first (migration 0008) |
| Migration fails on a fresh database | A function referenced a column added later in the same file | Add columns before the functions that use them (migration 0011) |
| `value too long for type character varying(240)` on data that is exactly 240 characters | The test cluster was `SQL_ASCII`, where `varchar(n)` counts **bytes** | Supabase is UTF8 (characters). `run-local-tests.sh` now creates a UTF8 database |
| Pages prerendered empty in live mode | `cookies()` makes Next throw `DYNAMIC_SERVER_USAGE`, which a catch-all swallowed | Both data-layer helpers re-throw that specific digest |
| `tsc` reports an error that isn't real | The incremental build cache, or a typecheck run in the same batch as a file write | Use `--incremental false`; never batch a write and its verification |
| `npx tsc` runs the wrong package | No `node_modules/.bin` in some sandboxes | Use `node ./node_modules/typescript/bin/tsc` |
| `supabase db push` wants to re-run everything | The CLI history table was missing (migrations went in via the API) | Stamped at handover; re-run `npm run supabase:sql` after adding migrations |

---

## 11. Where to look first

| You want to… | Open |
|---|---|
| Change colours or spacing | `app/globals.css` (CSS variables) + `tailwind.config.ts` |
| Change landing-page blocks | `components/home/*`, order controlled by `salon_settings.home_section_order` |
| Add a shop query | `lib/shop-api.ts` (server), `lib/shop-admin-api.ts` (admin/browser) |
| Change the checkout | `components/shop/CheckoutForm.tsx` + `app/api/orders/route.ts` |
| Touch pricing or stock rules | `supabase/migrations/*` + `place_order()` — then `npm run test:db` |
| Understand a past decision | `alikati-beauty-home-technical-documentation.md` (§1–19) and README §13–18 |
