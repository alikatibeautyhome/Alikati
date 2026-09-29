# Changelog

Every change made to this platform, in the order it happened. Dates are 2026-09-28 unless noted.

---

## v1.0 — Documentation, then the salon platform

**Delivered**
- `alikati-beauty-home-technical-documentation.md` — 19 sections: architecture, directory layout,
  full SQL schema + RLS, TypeScript contracts, UI specs, admin specs, data-access layer, security
  model, environment config, realtime, SEO, deployment, testing, incident playbook, glossary.
- The Next.js application: public booking site (landing, services, academy, portfolio, contact)
  + admin console (dashboard, appointments, services, leads, gallery, settings) + `/login`.
- `place_order`-style server authority, WhatsApp deep-link templates, slot availability endpoint,
  demo mode so the platform is reviewable with no backend.

**Decisions**
- Prices are never overwritten for promotions — `discount_price_npr` sits beside `price_npr`, so
  historical order totals stay accurate.
- Services are deactivated, never hard-deleted, because `ON DELETE RESTRICT` protects booking
  history.

---

## v1.1 — E-commerce extension

**Added**
- Tables `product_categories`, `products`, `orders`, `order_items` + 4 new enums.
- `place_order()` — server-authoritative: re-reads prices, reserves stock under a row lock,
  computes shipping from the free-delivery threshold. EXECUTE revoked from the public role.
- `cancel_order()` (restores stock) and `shop_kpis()`.
- Storefront: `/shop`, product detail, cart, checkout, order confirmation, tracking.
- Admin: products CRUD, categories, orders pipeline, customers.

**Fixed**
- Migration ordering and the first attempt at revoking EXECUTE (see v1.4 — it was ineffective).

---

## v1.2 — Logo, brand, supplier catalogue, accounts

**Brand**
- Installed the owner's logo (`public/media/logo.jpg`, `app/icon.jpg`) and sampled its pixels to
  build the palette: rose `#D54167`, gold `#C28A4C`, warm charcoal `#2A1B15`.

**Catalogue import** — `scripts/import-supplier-catalog.mjs`
- `colorpluscosmetics.com` (WooCommerce public Store API, 1,066 products exist; 150 imported).
  Prices arrive in minor units — divided by `10^currency_minor_unit`. Already NPR, no conversion.
- `welltencosmetic.com` (OpenCart, no API): the card markup proved unreliable to parse, so
  listings are used **only to census product ids** and each product page is read directly. All 19.
- Emits `data/imported-catalog.json`, `data/demo-catalog.json`, `supabase/seed-catalog.sql`.
  Deterministic ids, idempotent SQL. `--from-cache` rebuilds without any network calls.

**Customer accounts** — `/account/signup`, `/account/login`, `/account`; browsing, cart and guest
checkout all work without an account. Customer auth is a separate table from staff auth.

**Contact** — phone `+977 9869512756`, `alikatibeautyhome@gmail.com`, Facebook/Instagram/TikTok —
in the footer, contact page and `sameAs` structured data, all editable in settings.

---

## v1.3 — Mobile/UX pass

- Product titles and descriptions clamped to 2 lines; the imported supplier names are long and
  were making cards uneven.
- **Bug:** the admin sidebar had `overflow-y-auto` without `min-h-0`, so the nav overflowed
  instead of scrolling once it grew to three groups.
- The floating WhatsApp button covered footer links and the last row of content — the footer now
  reserves clearance.
- Sticky, retracting mobile action bar on product pages, kept clear of the WhatsApp button.
- Admin tables: status chips scroll, KPIs 2-up on phones, modals got a sticky full-width action.

---

## v1.4 — Supabase connected and verified

- First real execution of the migrations, against local PostgreSQL 16 and 14 with an environment
  shim (`supabase/local/00-shim-pre.sql`) — no Docker required.
- `supabase/local/run-local-tests.sh` + `10-functional.sql`: **49 assertions** covering schema,
  business rules and the RLS matrix.

**Bugs found and fixed**

| # | Bug | Impact |
|---|---|---|
| 1 | **Migration 0008 could not be created** — `CREATE OR REPLACE` cannot change an OUT row type | `db push` would fail outright |
| 2 | **`preview_coupon()` was broken** — its OUT parameter `code` collided with `coupons.code` | Every coupon check failed with `column reference "code" is ambiguous` |
| 3 | **`REVOKE … FROM anon, authenticated` was a no-op** — PostgreSQL grants EXECUTE to `PUBLIC` on new functions | `anon` could call `place_order()`, `preview_coupon()` (coupon enumeration), `cancel_order()` and `shop_kpis()` (revenue) directly |
| 4 | **CRITICAL — every customer signup became staff.** `handle_new_staff_user()` fired on all `auth.users` inserts and set `role = 'staff'` unconditionally | Anyone registering could read all orders (names, phones, addresses), the customer list, and **change product prices**. Proven live, then fixed in migration 0010 by gating on an explicit `role` claim |

**Also added**: `apply-all.sql` (all migrations, one transaction, refuses to run twice),
`scripts/create-admin.mjs`, `scripts/build-apply-all-sql.mjs`, PWA manifest + service worker +
install prompt, cookie notice, `/privacy`, dark mode via CSS-variable tokens, coupons, affiliate
programme, `/admin/users`.

**Bugs found in my own tooling**: the seed's verification query used `ORDER BY c.display_order`
without grouping it (42803, aborted the whole catalogue load); the local runner's UTF8 patch
injected a quote inside a shell string.

---

## v1.5 — Owner request batch

- Admin password changed on the live project (verified: new password `200`, old `401`).
- `/admin/users`: create admin/staff/customer accounts, change roles, reset passwords, deactivate.
  Deactivation is reversible and never deletes an auth user, so order history survives.
- **QR on the payment screen** (`components/shop/PaymentQR.tsx`) — the owner's uploaded QR, or one
  generated in the browser from `payment_qr_content`. Hidden for cash on delivery.
- **Payment statement upload** — private `payment-proofs` bucket; only the object key reaches the
  server; staff read via short-lived signed URLs. A failed upload never blocks the order.
- **WhatsApp order hand-off** now carries reference, name, phone, address, items, subtotal,
  discount, delivery, total and transaction id.
- **Nepali (Bikram Sambat) dates** everywhere alongside AD, via `lib/nepali-date.ts`
  (`nepali-date-converter`, verified against the BS epoch, Nepali New Year and round trips).
- Coupon validity presets: 7/10/15/30/60/90 days or no expiry, with "Ends in N days" labels.

**Bugs found by unit-testing the date helpers**
- Month 6 was labelled `Ashwin` — wrong; it is **Ashoj** (असोज).
- `bsToAd()` returned local midnight, which renders as the **previous day** east of UTC;
  `adToBs()` now resolves the calendar day in Asia/Kathmandu (a 20:00Z timestamp correctly rolls
  to the next BS day).
- Migration 0011 referenced `is_active` before the column existed (function body validation).

---

## v1.6 — The checkout failure, root cause and features

**Root cause of "We could not place your order"**
The owner was signed in **as the administrator**. A signed-in checkout sends `customer_id`, and
`orders.customer_id` references `customers(id)` — but staff accounts have **no** `customers` row,
because migration 0010 creates one only for non-staff signups. The foreign key rejected the insert,
`place_order()` raised, the API returned 500, and the form collapsed every cause into one sentence.
**Any signed-in staff account was unable to buy anything.**

**Fixed in three layers**
1. The API creates the missing `customers` row for a verified signed-in user.
2. Migration **0012** degrades an unknown `customer_id` to NULL instead of raising — a stale id can
   never fail a sale. Generated from the *live* function definition, so it cannot drift.
3. The checkout reports the truth: per-field `422`, verbatim `409`, "wait a minute" `429`, and for
   `5xx` a clear message with **Try again** — never clearing what the customer typed. Raw status and
   body are logged for support.

**Added**
- **Dynamic amount QR** — `{amount}` in `payment_qr_content` is replaced with the live total, and
  the total is always printed beside the code.
- **Phone normalisation** — `+977 982-5679585`, `977…`, `0…` and plain 10 digits all resolve.
- **Product thumbnails** in the admin order detail and on the customer's confirmation.
- **Editable hero** — upload the photograph and edit heading/subheading/badge from settings.

**Tooling note**: `tsc --noEmit` with the incremental cache reported a phantom `TS5076`;
`--incremental false` gives the truth.

---

## v1.7 — Hero slideshow (migration 0014)

- New `hero_slides` table (image, alt text, optional per-slide heading/subheading, order, active)
  with public-read-active and staff-write policies. One slide seeded from the existing
  `hero_image_url`, so the owner's uploaded photo survived; that field remains the fallback.
- `components/public/HeroSlideshow.tsx`: cross-fade with all images pre-decoded (no empty frame),
  5 s autoplay, pause on hover/focus/hidden tab, **no autoplay under `prefers-reduced-motion`**,
  swipe on touch, 44 px dots, arrows from `sm` up, `priority` only on the first image, duplicate
  URLs filtered out.
- Managed from **Settings → Hero slideshow**: add, edit, reorder, activate/deactivate, delete.

---

## v1.8 — Landing page redesign + new palette (migrations 0015)

**Palette** — sampled from the owner's reference image rather than eyeballed:
primary **#E23D7C**, accent **#ED4080** / deep **#C21F63**, tiles **#FFF2F5** on **#FDFBFC**,
prices **#12874A**, sale badges **#E53935**, gold retained for the logo. Because surfaces and tints
are CSS variables and the hues are Tailwind tokens, the change re-themed the whole application at
once — including dark mode — without touching component code.
New gradients: `gradient-hero`, `gradient-sale`.

**Landing page** rebuilt in the reference's order:
hero (gradient band, badge pill, two CTAs, the existing slideshow blended in, "100% Original" seal)
→ feature strip overlapping the hero edge → **Best Sellers → Shop by Category → promo band →
services → academy → portfolio → reviews** (order from `salon_settings.home_section_order`, which
was updated — new keys would otherwise have been appended after reviews) → trust strip → CTA.

| Block | Data |
|---|---|
| Category tiles | live categories with real counts (Skincare 93, Makeup 45, Hair Care 11) |
| Promo band | `settings.promo_*` — the owner's own words, hides when disabled; the site never invents a discount claim |
| Best Sellers | live products; **stars render only when a real `rating_average` exists** |

**Bugs found**
- **`bg-amber/10` is not a valid Tailwind class** (no bare `amber` key) — those info panels had
  **no background at all**.
- Discount badges were inconsistent (gold on the product page, rose on service cards), and not
  every price used the green treatment. Unified on `bg-sale` / `text-price` across the product
  page, service cards, cart, checkout, confirmation and tracking.
- Stale warm-brown tints and old-brand hexes replaced with pink tokens across 16 files.

---

## v1.9 — Mobile UI/UX pass

Scope: phones, 360–430px. The desktop layout was deliberately left alone.

**Bugs found and fixed**

| # | Bug | Impact |
|---|---|---|
| 1 | **The hero's secondary CTA was invisible in light mode.** `buttonVariants({ …, className })` does *not* merge classes — cva joins them, it does not run tailwind-merge — so the passed `bg-white text-rose-600` was emitted *alongside* the default variant's `bg-rose-gold text-white`. Both reached the stylesheet and the variant won on source order: white text on a white pill. | The second hero action looked like an empty pill on every phone. Now `cn(buttonVariants(…), …)` with literal hexes — white on magenta in **both** themes (the old `bg-white` was also being remapped to the dark surface by the dark-mode bridge in `globals.css`). |
| 2 | **The floating WhatsApp button sat on the footer copyright line** on every page. The `pb-24` clearance covered the footer's link columns only; the copyright bar that follows them had plain `py-5`. | The last line of the page could not be read or tapped. The bar now reserves 96px on phones — measured: the copyright sits 120px above the page bottom, the button occupies the bottom 76px. |
| 3 | **The same button covered the product page's sticky purchase bar**, which reserved `pr-20` for it and truncated the product name to "Boat Kids Sensiti…". | The button is suppressed on `/shop/<slug>` below `lg` (the purchase panel and the footer both offer WhatsApp ordering there) and the reserved padding is gone. |
| 4 | **iOS auto-zoomed the page on every form field.** Inputs, selects and textareas were 14px; iOS Safari zooms when a focused field is under 16px, and the page stays zoomed afterwards. | `text-base sm:text-sm` on all three. Affects checkout, contact, search, account and affiliate forms. |
| 5 | **Tap targets under 44px**: the five service "Book" buttons and the announcement × were 40px; the contact CTAs were 40px and sat side by side. | All ≥44px; the contact CTAs are full-width and stacked on phones. |
| 6 | **Feature and trust strip copy was unusable at 390px** — a 44px icon left ~105px for the description, which wrapped into a five-line column. | Icon above text on phones, description full width, 13px. |

**Improvements**

- **`rail-hint`** (new utility in `globals.css`, phone-only): fades the clipped last item of a horizontal rail. Applied to the shop and services filter chips, the category tiles and the services rail. A chip cut off at the right edge read as a broken layout rather than a scrollable row.
- **Product cards**: names clamp at three lines on phones (long imported supplier names were cut mid-word at two), with tighter mobile padding and a smaller discount badge.
- **Shop filters**: "Sort" and "In stock only" now share one row under the search box instead of stacking as three full-width rows — the first product appears about a screen and a half sooner.
- **Footer**: the Shop and Salon link columns sit two-up on phones, which cuts roughly 40% off the footer height.
- **Install prompt** sits above the floating button on phones; it was rendering underneath it.
- Hero seal, header, product imagery and every desktop breakpoint are unchanged.

**Verified**
- `node ./node_modules/typescript/bin/tsc --noEmit --incremental false` — clean.
- `npm run build` — clean, 36 pages.
- A Chrome DevTools Protocol sweep with real device emulation (390 × 844, Android UA, 13 routes): `scrollWidth == clientWidth == 390` on every route, so **no horizontal overflow anywhere**, plus computed values for each fix above (hero CTA `rgb(184,26,92)` on `rgb(255,255,255)`; card titles `line-clamp: 3`; add-to-cart 44px; inputs 16px; sort row shared; contact CTAs 316px wide and stacked; WhatsApp button `display: none` on the product route, `flex` elsewhere).
- **Not verified**: pixel-level appearance. No screenshot could be viewed in this environment — the browser relay and the image pipeline were both unavailable. Every shape, spacing and colour claim above comes from computed styles, not from looking at the page.

---

## v1.10 — Connected to the live Supabase project

**Connected**

`.env.local` now points at project **`xoygmkyrovepkesxvjij`** (`ap-northeast-1`, Tokyo), so `isDemoMode()` returns `false` and the storefront, checkout and console run against the real database. Two of the three credentials in the handover notes could not be used as recorded:

| Value | Problem | Resolution |
|---|---|---|
| Project ref | The notes read `xoygmykrovepkesxvijj`, which **does not resolve in DNS** — a transposition of the real ref | Confirmed against the Supabase Management API (`GET /v1/projects`) instead of guessed |
| `sb_secret_…` service-role key | Returned `401 Invalid API key` on every table | Re-fetched the authoritative value from the Management API and verified it against the live project |
| `sb_publishable_…` key | Correct as recorded | — |

**Verified against the live project (not assumed)**

| Table | Rows | Table | Rows |
|---|---|---|---|
| `products` | 169 | `customers` | 2 |
| `product_categories` | 7 | `orders` / `order_items` | 2 / 4 |
| `hero_slides` | 5 | `coupons` | 1 |
| `salon_settings` | 1 | `profiles` (admin) | 1 |
| `services`, `appointments`, `academy_leads` | 0 | | |

That matches HANDOVER §1 — including services, courses and leads being deliberately empty. **No rows were written, changed or deleted during this session.**

**RLS proven with both keys, rather than read off the policies**

- Publishable key (what a visitor gets): reads products (169), categories (7), hero slides (5) and settings (1), and gets **0 rows** from `orders`, `customers`, `coupons` and `profiles`.
- Secret key: the same `orders` query returns rows, so the key does bypass RLS and the 0 rows above are the policy working, not an empty table.
- The publishable key is present in 2 client chunks (by design). The secret key's literal value appears **nowhere** under `.next/static` — the only `sb_secret_` match is supabase-js' own `key.startsWith("sb_secret_")` type check.

**Fixed**

- **`.gitignore` had no rule for `*.local.md`.** `CONNECTION.secrets.local.md` — the file this project's process creates next to the code, holding the service-role key and a personal access token — would have been committed on the next `git add .`. The repository is public. Added `*.local.md` and `CONNECTION.secrets.md`; `git check-ignore -v` now confirms both that and `.env.local` are ignored.
- The staff login screen's email placeholder still read `admin@alikati.demo` with the database connected. It is now demo-aware.

**Open item — the owner's console password**

The admin account `alikatibeautyhome@gmail.com` (profile "Nirmala Khadka") is healthy: email confirmed, not banned, `role: admin`, last successful sign-in `2026-09-28T10:39:21Z`. But the password recorded in the handover notes (`Alikati#Home@2026`) returns `400 Invalid login credentials`, so that recorded value is stale or was mis-transcribed. Reset it with `node scripts/create-admin.mjs --email=… --password=… --name=…` (it updates an existing user rather than creating a duplicate).

**Security follow-ups**

- **Rotate the `sb_secret_…` key and the `sbp_…` personal access token.** Both were shared as screen captures and are now in chat history. The running application never needs the PAT — it is only for migrations and SQL.
- **The public preview tunnel serves the live database.** Anyone holding the link can reach the password-protected console and can place a **real** order. Close the tunnel when the review is finished.

---

## v1.11 — Customer reviews, moderated before they appear

The carousel used to render six quotes compiled into the component, each hardcoded to five stars.
That is business data the platform invented on the salon's behalf — rule 2 of PROMPTS.md forbids
exactly that. Reviews are now real rows, submitted from the landing page and published only after
a staff member approves them.

### What a customer can do

- **Write a review** from the landing page: name, 1–5 stars, an optional "what did you come in
  for", and the review itself. Submitting shows *"Thank you — your review has been sent to the
  salon. It will appear here once someone has checked it."* — no false claim that it is live.
- The section shows an honest empty state until something is approved, so it never displays
  content nobody wrote.

### What the owner can do

- New **/admin/reviews** console (also in the sidebar): a "Waiting" queue with a count, plus
  Published and All filters. Approve, un-publish, or delete each review; the pending queue is
  ordered oldest-first so it can be worked in order.
- Un-publishing and deleting are live immediately; publishing reaches the page within the
  homepage's 60-second ISR window.

### Database — `supabase/migrations/20260929000001_reviews.sql`

New `public.reviews` table, five RLS policies and the column grants below. The insert policy is
what makes moderation real rather than cosmetic: a caller cannot hand in an already-approved row,
cannot stamp `approved_at`/`approved_by`, and cannot label their own row `admin`.

| | |
|---|---|
| Public read | approved rows only |
| Public insert | pending only, `source = 'website'` |
| Staff | read every row (the queue), update, approve |
| Admin | delete |

**The security bug this migration was written to avoid.** Row-level security is *row*-level: a
public read policy exposes every column of a matching row. The first draft of this table carried
the reviewer's email, which would have handed it to anyone with the publishable key — a whole
table of addresses behind an `is_approved = true` predicate. Two changes fixed it properly, rather
than relying on the UI not asking:

1. **No contact details in the table at all.** If the salon ever wants a reply-by-email, it goes in
   a separate staff-only table.
2. **Column-level grants** keep `approved_by` (the approving staff member's id) out of reach:
   `anon` and `authenticated` are granted SELECT on every column *except* that one. PostgREST
   therefore rejects `select=*`, which is why `lib/reviews-api.ts` and
   `lib/reviews-admin-api.ts` name their columns explicitly.

### The six old testimonials

Carried into the table verbatim but inserted **pending**, with `source = 'imported'`, so they show
in the console marked *Imported* and the owner decides. They were not auto-approved: nobody has
verified the customers behind those names, and the five stars were written into the markup rather
than earned. **Until one is approved the homepage review section shows the empty state — approve
the genuine ones in /admin/reviews (one click each), or run:
`UPDATE public.reviews SET is_approved = TRUE, approved_at = now() WHERE source = 'imported';`**

### Files

Added `types/reviews.types.ts`, `lib/reviews-api.ts` (server read), `lib/reviews-admin-api.ts`
(browser moderation), `app/api/reviews/route.ts` (rate-limited public POST),
`components/public/ReviewSection.tsx`, `app/(admin)/admin/reviews/page.tsx`.
Changed `components/public/ReviewCarousel.tsx` (data-driven), `app/(public)/page.tsx`,
`components/admin/AdminSidebar.tsx`, `.gitignore` (see v1.10), migration bundle + test suite.

### Verified

- `npm run test:db` — **61 assertions, all passing** (49 before this change). The 12 new ones
  impersonate `anon` and `authenticated` for real (`SET ROLE`), so these are enforcement results,
  not policy text: anon sees only the approved review, cannot read a pending one, cannot submit an
  already-approved row, cannot stamp an approval timestamp, cannot approve by UPDATE, cannot delete,
  and cannot select the approving staff id; staff can read the whole queue, publish, and are still
  stopped by the check constraint if they omit the timestamp.
- **One of those assertions failed on the first run** — an `INSERT` listing four columns with three
  values. Fixed; the point stands that this suite has to be executed, not read.
- `tsc --noEmit --incremental false` clean; `npm run build` clean, **42 routes**.
- Live project: migration applied and probed. The publishable key reads 0 rows and is refused
  `approved_by` (`401 permission denied`); the secret key sees the 6 imported rows, all pending.
- **End-to-end on the live site**: a real POST to `/api/reviews` was accepted (`201`, pending),
  invisible to the public key, then approved and confirmed visible on the served homepage — with
  the summary line reading *"5.0 out of 5 from 1 approved customer review"*, i.e. arithmetic over
  the row actually shown. The probe was deleted afterwards; 6 seeded rows remain, all pending.
- Mobile at **360px and 390px, light and dark**: no horizontal overflow, the form opens on click,
  all inputs 16px (no iOS zoom) and 44px tall, five 44px rating targets, no overflow when the form
  is open.

**Not verified**: an actual authenticated click through the console — the admin password is still
the open item from v1.10, so approve/un-publish/delete were exercised through the same Supabase
calls the console makes, not by driving the UI.

---

## v1.12 — Affiliate applications carry social accounts

The programme is approved on the strength of an applicant's audience, but 0008 left nowhere to
record it: staff were deciding on a name and a phone number alone. An application now carries
Facebook, Instagram and TikTok, and the approval queue shows them.

### Database — `supabase/migrations/20260929000002_affiliate_socials.sql`

Three nullable columns on `public.affiliates`, named and shaped to match `salon_settings` from
0007 — `facebook_url`, `instagram_url`, `tiktok_url`, full `https://` URLs. Two tables in this
schema describing the same three things should describe them the same way.

Three CHECK constraints pin the shape, and a rewritten `affiliates_apply_public` policy requires
at least one of the three.

**Why a policy and not a CHECK constraint.** A CHECK applies to every write, which would stop staff
clearing a dead TikTok link on an already-approved member. The requirement is about *applying*, so
it belongs in the INSERT policy. Constraint = "this value is well-formed"; policy = "this applicant
may submit this".

Existing rows are unaffected: `PRADEEP` was applied for before this migration and still has NULL
socials, which the staff-side UPDATE path permits.

### `lib/socials.ts` — one source of truth

Normalising, validating and link-building live in one dependency-free module, and both forms
render `SOCIAL_FIELDS` rather than hand-writing three near-identical blocks. Applicants can type
`@nirmala.k`, `nirmala k`, `instagram.com/nirmala.k?igsh=…` or a full URL; all of it lands as a
canonical profile URL, and anything unparseable is reported rather than silently stored.

Facebook is the deliberate exception: a link already on a Facebook host is kept verbatim, because
real profile links such as `facebook.com/share/1Dgw2YFiiZ/` have a two-segment path that must not be
truncated to `share`. Instagram and TikTok are always rebuilt from the handle, so two applicants
describing the same profile cannot store two different strings.

### Console

- A **Social accounts** column in `/admin/affiliates`, immediately after the name, so a pending
  application can be judged without opening anything. Links open in a new tab.
- The edit modal gained an optional **Social accounts** fieldset (staff may clear or correct a
  link; a member added by hand is not forced to supply one).

### Verified

- `npm run test:db` — **64 assertions, all passing** (61 before). New: anon CAN apply with an
  account, CANNOT apply with none, CANNOT apply with a link to the wrong network, and staff CAN
  read an applicant's accounts.
- **Two existing assertions were fixed rather than left passing.** `anon cannot self-approve an
  affiliate` and `anon cannot fabricate affiliate earnings` inserted no social account, so after
  this change they would have failed on the *new* requirement instead of the guard they exist to
  test — a test that passes for the wrong reason. Both now carry a valid account.
- `lib/socials.ts` was compiled with `tsc` and executed under Node against 10 real inputs: all 10
  passed, and every value it produces satisfies its own validator. **The first run found a real
  defect** — `https://instagram.com/x/` (no `www`) was returned uncanonicalised because the
  "already a URL" shortcut fired before the handle rebuild, contradicting this migration's own
  comment. The code was fixed, not the comment.
- Live project: columns, policy and all three constraints confirmed present; a public POST with no
  account is refused `401` by RLS, a wrong-network link is refused `400` by the constraint, and an
  application carrying accounts is accepted `201`, stored pending, and readable by staff but not by
  the public.
- `/affiliate` at 360px and 390px: the enlarged form has no horizontal overflow, and all seven
  fields are 16px/44px.

**Adjacent issue noticed, deliberately not changed.** `affiliates_apply_public` does not constrain
`commission_rate`, so a public applicant can submit any rate up to the column maximum of 50 and, if
approved without the rate being checked, earn 50% of every referred subtotal. The rate is visible
in both the table and the modal, so review is the control — and changing it would alter existing
behaviour beyond this task. Worth a decision: cap it in the policy, or force it to
`settings.affiliate_commission_rate`.

---

## v1.13 — The salon's monogram on every product image

Every product photograph now carries the AB mark in its bottom-right corner.

### Why an overlay, not a stamped file

The catalogue's images are **hot-linked from the suppliers' own servers**
(`colorpluscosmetics.com`, `welltencosmetic.com`). There is no file of ours to stamp — burning the
mark in would mean downloading and re-hosting every image of all 169 products, and it would break
the moment a product image is replaced in the console, or when the next catalogue is imported. The
overlay applies to whatever the product's image is, forever, with no data migration.

### The asset — `public/brand/abh-logo.png`

The supplied file was a 1254×1254 JPEG: the artwork on a large white field, no transparency.
Neither ImageMagick, Pillow nor sharp is available in this environment, so the preparation was done
through Chrome's canvas over CDP (the same route used for the mobile measurement sweeps):

- **Cropped to the artwork** — the ink bounding box is 460×372 at (428, 420) of the original; left
  as-is, ~78% of every badge would have been empty white.
- **White knocked out** — `alpha = 255 − min(r,g,b)`, giving a real alpha channel.
- Delivered at **512×414**, which is 144 KB and is served through `next/image`, so the browser
  actually receives a ~256px-wide variant.

Verified numerically on the saved file: 512×414, alpha channel present, corners fully transparent,
33 603 visible pixels, and ink present in every expected region (crown band 6 052 px, swash band
863 px, 98 ink pixels across the monogram's mid row) — proof the crop kept the artwork rather than
clipping it.

### `components/shop/ProductBrandMark.tsx`

- **Bottom-right**, because the discount badge already owns the top-left; verified that the two
  rects do not intersect on a discounted product.
- **On a translucent white plate with a hairline ring.** The mark is gold and pale pink; over a dark
  product shot the thin strokes would vanish without it, and over a light one the knocked-out white
  would sit awkwardly with no edge to define it.
- **Sized so the monogram is legible, not so the artwork fits.** The bounding box is ~1.24:1 because
  of the heart swash, so the crown-and-circle is only ~55% of the width: at a first pass of 28px the
  circle was ~15px and the AB inside it ~8px. Now 32px on phones and 40px from `sm` up, and 64px in
  the detail hero. One line to change if it wants to be larger or subtler.
- **Decorative** (`aria-hidden`, empty `alt`): the product name is already in the accessible tree, and
  repeating "Alikati Beauty Home" after each of twenty-four products is noise, not information.
- `pointer-events-none`, and it sits inside the product link — so clicking the mark still opens the
  product.

### Where it appears

| Surface | Marks |
|---|---|
| `/shop` grid | 169 of 169 product images |
| Homepage featured products | 8 |
| Product detail page | 1 hero (size `md`) + 4 related cards |
| Cart, checkout, order confirmation, admin tables | not applied — see below |

### Verified

- `tsc --noEmit --incremental false` clean; `npm run build` clean.
- Measured at 390px and 1280px: correct mark count on every surface, **0** marks outside their image
  box, **0** not bottom-right aligned, **0** zero-sized, **0** logo images failed to load, **0**
  overlapping the discount badge, no horizontal overflow.
- Rendered sizes confirmed per breakpoint: phone card plate 36×30 (logo 32×26), desktop card 44×36
  (logo 40), detail hero 68×56 (logo 64×52).
- Live through the public tunnel: `/shop` 200 with 169 marks, `/brand/abh-logo.png` 200.

### Not covered, and why

1. **Cart, checkout, order-confirmation and admin thumbnails** (48–96px). A proportionate mark there
   is ~12–20px, which renders the monogram as an unreadable smudge — it would look like a rendering
   fault rather than branding. Easy to add if wanted, with a size cut-off.
2. **Social link previews.** `og:image` for a product is the supplier's own URL
   (`https://colorpluscosmetics.com/…/Sunscreen-for-Kids.jpeg`), so sharing a product link on
   Facebook or WhatsApp still shows an unbranded photo. A CSS overlay cannot reach that. The fix is a
   per-product dynamic OG image that composites the photo and the mark — a real change to how the site
   presents itself externally, so it was raised rather than assumed.

---

## v1.14 — The mark alone, on a white canvas

Correction to v1.13, on the owner's instruction: *"only add this logo but nothing else … only need
product and logo with white background."*

### What changed

| | v1.13 | v1.14 |
|---|---|---|
| The mark | Transparent logo **on a white chip** (rounded, ring, shadow, 2px padding) | The transparent logo **alone** — no plate, no ring, no shadow, no padding |
| Product image canvas | `bg-blush-100` (pink) / `bg-blush-50` on the detail hero | literal white, `bg-[#ffffff]` |
| Image fit | `object-cover` | `object-contain` |

### What the images actually are — measured, not assumed

The instruction to "add a white background" only makes sense against what the photos already are, so
24 images were sampled (a mix of PNG and JPEG, downloaded and read pixel-by-pixel through a canvas):

- **Every one has a pure white background already** — all four corners exactly `255,255,255`, and
  74–93% of each image is ink-free white.
- They are **square**: `1080×1080` (PNG) or `1600×1600` (JPEG), with the product filling ~91% of the
  canvas and a ~4.6% margin on each side.
- The PNGs are RGBA, but **not** transparent in practice — 0.0–0.2% of pixels have alpha below 16.
  They carry an unused alpha channel.
- A handful are wide `327×150` images, not packshots.

So the "white background" was never missing from the photos — what was wrong was the **frame**: a
4:3 container with `object-cover` was scaling each square photo until its width filled the card and
then cutting **12.5% off the top and bottom**, which given the 4.6% margin means roughly **8% of the
product itself** was being clipped. The pink container never showed, because a covering photo hid it
— except while loading. `object-contain` on a white canvas shows the whole product instead, and also
stops the wide 327×150 images being sliced into a narrow strip.

`bg-[#ffffff]` rather than `bg-white` deliberately: the dark-mode bridge in `globals.css` remaps
`bg-white` to the dark surface, which would have framed the white product shots in a dark box in dark
mode. Measured as `rgb(255, 255, 255)` in both themes.

### The trade-off, stated plainly

`contain` fits a square photo to the **height** of a 4:3 frame, so the product renders across ~75% of
the card width: fully visible, but about **25% smaller in linear size** than the old cropped version,
with white either side. Nothing is cropped and the canvas is clean, at the cost of the product being
smaller. If the size matters more than the crop, the alternative is one class — `aspect-[4/3]` →
`aspect-square` on `ProductCard`, which lets a square photo fill its frame exactly (no crop, no side
space, product back to its previous size) at the cost of taller cards.

### Verified

- Every product image renders `object-fit: contain` on a `rgb(255,255,255)` canvas, in **light and
  dark** — 169 image boxes, 169 marks, no horizontal overflow.
- The mark has no plate: computed `border-radius: 0px`, `background-color: rgba(0,0,0,0)`,
  `box-shadow: none`. Just the logo, at 32px on phones, 40px from `sm`, 64px in the hero.
- 0 marks outside their image, 0 overlapping the discount badge, 0 logo images failing to load.
- Live through the tunnel: 169 marks, 169 white canvases, 169 `object-contain`.

---

## v1.15 — Supplier branding removed from the copy; mark enlarged; watermark measured

Three requests in one: remove *"bujhau bujherai kinau"* and *"ColorPlus Cosmetics"*, and make the mark
more prominent.

### 1. The supplier's shop name in the product copy — fixed

Neither phrase appears in any site copy: `salon_settings`, `hero_slides`, `services`,
`academy_courses`, `gallery_items`, `reviews` and `affiliates` were all searched and contain neither
the romanised nor the Devanagari forms. What did exist was **one product description** carrying the
supplier's shop name:

> `…Tinted Serum Foundation — now available at ColorPlus Cosmetics! Infused with 1% Hyaluronic Acid…`

It was in `loreal-infallible-24h-tinted-serum-foundation`, and because that field also feeds the
page's `<meta name="description">` it was being shown to Google as well:

> `Available at ColorPlus Cosmetics in 6 shades specially chosen for Nepali…`

Rewritten to "— now in our shop." in both `description` and `short_description`. All 169
descriptions were then swept for supplier names, URLs, domains, phone numbers, "available at",
"order from", "shop at" and "whatsapp": **this was the only row.** Verified on the running site —
`colorplus` appears **0** times on that product page.

Note: product pages are ISR with `revalidate = 300`, so the change lands on the public page within
five minutes of the database write, not instantly.

### 2. The mark, enlarged

32px → **44px** on phones and 40px → **56px** from `sm` up; 64px → **80px** in the detail hero. On a
390px phone the mark is now 44×36 inside a 171px card — 26% of the card width. The artwork is native
460px wide, so every size up to 96px is a *downscale* and stays crisp. Still no plate, no ring, no
shadow; still `aria-hidden` and click-through.

Measured after the change: 169 marks on `/shop`, 5 on the detail page, no horizontal overflow. The
mark's box now comes within ~4px of the product's bounding box on a centred packshot — the bounding
box, not the product's silhouette, which is narrower — so it sits at the product's lower-right edge.
One class to change if it looks too close.

### 3. "Bujhau bujherai kinau" / "ColorPlus Cosmetics" on the images — **measured, not applied**

Both phrases almost certainly appear on the product photographs themselves as the supplier's own
watermark, so this is not a text fix. All **169 images** were downloaded and read pixel by pixel:

| Finding | Evidence |
|---|---|
| Every image carries a mark in the **top band** | margin-only ink in **169/169** images; ends at y ≤ **18%** (median 11.2%) |
| Most carry a second mark in the **bottom band** | margin-only ink in **150/169**; starts at y ≥ **86.1%** |
| It is the **same artwork on every product** | identical ink checksums across different products — e.g. `351483` on 5 images, `286382` on 4, `742829` on 3 |
| The product sits in the **middle** | centre-column ink only; the outer 15% margins are inked *only* in the watermark bands |

So a crop hiding the outer ~16% would remove both marks — **but it is not provably safe**, and the
measurements say so rather than the intuition:

- The mark's vertical extent differs by batch (one group ends at 11.8%, another at 18%), and the
  batches are **not** uniform: 150 images are square packshots, **19 are wide 327×150 banners** whose
  layout is nothing like a packshot.
- Attempting to separate mark from product by margin heuristics **overlaps on 102 images**, because
  whether the mark reaches the outer margin depends on the image. Cross-image differencing — which
  isolates a watermark cleanly when products sit in different places — is confounded here precisely
  because every product is a centred packshot, so the middle of every image "matches" too.

Cropping 169 live product photographs on that basis could clip the top of the product on some
images, and there is no way to check the result in this environment — the image pipeline is
unavailable, so the work cannot be visually verified. Rather than risk the catalogue,
`watermark-preview/crop-comparison.png` was produced: four real products from different batches,
original above with the area the crop would remove outlined in red, proposed crop below. Approve it
and the crop is a small change; crop tighter or looser is one number.

**Still open from v1.14, unchanged:** cart/checkout/admin thumbnails, and social link previews
(`og:image` still points at the supplier's own URL, so a shared product link shows their unbranded
photo). — both resolved in v1.16 below.

---

## v1.16 — Every product image is processed on the way out

The owner's instruction: *"make changes on like this on every products and when i add new products
image automatically add white background and logo."* The second half is the demanding one — it rules
out any one-off edit or batch job, and means the work has to happen in the application.

### `app/api/product-image/route.ts`

Every product photograph is now served through this route, which:

1. **flattens the source onto a white canvas**, so a new product uploaded as a cut-out PNG arrives on
   the page already looking like a catalogue shot rather than on a transparent or black background;
2. **paints out the supplier's watermark** — the two marks measured in v1.15;
3. **stamps the salon's mark** bottom-left, at the position and size of the owner's approved sample.

Because it is request-time, a product added in the console needs no extra step: paste the image URL,
and the next render processes it. There is no queue to re-run after an import and no per-product
setup.

`lib/product-image.ts` is the single place that builds the URL, used by the product cards, the detail
hero, the cart, order confirmation and both admin tables — so a thumbnail and a hero shot cannot
disagree.

### The geometry is applied only where it was measured

The mark boxes are fractions of the image (top-right x 64–100% y 1–14%; bottom-left x 0–34%
y 82–100%), derived from reading all 169 catalogue images. The catalogue also contains **19 wide
banner-shaped images (327×150)** whose marks sit elsewhere entirely — for those the same boxes would
erase real content *and* miss the mark. A `SQUARE_TOLERANCE` guard applies the whitening only to
images within 15% of square, i.e. the packshots the fractions describe; everything else still gets
the white canvas and the mark, and keeps its own pixels otherwise.

### Also fixed by routing through the route

- **Social link previews are branded now.** `og:image` pointed at the supplier's own URL, so sharing
  a product link showed their unbranded photo with their watermark. It is now the processed image on
  our own domain, served as PNG because some scrapers still will not render a WebP preview. This
  closes the item left open in v1.13.
- **Cart, checkout, order-confirmation and admin thumbnails** are processed too, closing the other
  v1.13 item.
- The CSS overlay component (`ProductBrandMark.tsx`) is gone — the mark is part of the image now, so
  a separate overlay would have doubled it.

### A bug worth recording

The first build of the route appeared to work but silently served the untouched original. sharp was
rejecting its own buffer with *"Input buffer contains unsupported image format"*, and the cause was
not the bundler or the input: `sharp({ create }).composite([...]).toBuffer()` on its own emits **raw
RGBA pixels** — 10.2 MB for a 1600² canvas, starting `ffffffff` — because a raw `create` input has no
format to inherit. Feeding that to a second `sharp()` cannot work.

The fix is to set the output format on the *same* pipeline as the composite. This was reproduced
line-for-line in plain Node before being fixed, which is how we know it was our code and not
Next.js. The fallback behaviour is what made it easy to miss: the route serves the original bytes on
any failure, so the page looked fine while nothing was being processed.

### Verified

- **Pixel-level, on the delivered output**: watermark regions read `[255,255,255,255]`; the mark area
  reads gold `[212,173,134]`; **0 non-opaque pixels** (the canvas really is white); ink in the top
  10% band **0.0%** (watermark gone); ink in the product region **42.7%** (product intact).
- A **transparent PNG from a new host** — our own logo over https — came out `512×414`, corners
  `[255,255,255,255]`, **0 transparent pixels**: the white-background path works, which is the
  behaviour a newly added cut-out product will get.
- **SSRF guards**: `http://` → 400, `https://127.0.0.1` → 403, `https://localhost` → 403, missing
  `src` → 400.
- **On the rendered page**: 169 product images, **0 broken**, all served through
  `/_next/image?url=%2Fapi%2Fproduct-image…`, load event at **1.45 s** on a 390px viewport, no
  horizontal overflow.
- Live through the tunnel: `/api/product-image` → `200 image/webp`, 29,582 bytes for a 92,578-byte
  source JPEG.
- `tsc --noEmit --incremental false` clean; `npm run build` clean.

**Caveats, stated plainly.** The images are still *fetched* from the supplier's CDN and their domain
still appears inside the `src` parameter of the image URL — unavoidable while hot-linking, and
invisible to a visitor, but it is in the page source. Output is cached seven days, with the upstream
fetch revalidated weekly, so a supplier replacing a photo propagates within a week. And 19 wide
banner images keep their own layout (see the tolerance guard above).

---

## v1.17 — The Well 10 Professional showcase at `/well10`

**Delivered**
- `lib/well10-catalog.ts` — the nine-SKU Well 10 range. Prices, pack sizes, pack counts and
  descriptions are exactly as the owner supplied them, and both order-summary figures are
  **derived** by `summariseWell10()` rather than written down twice.
- `components/shop/Well10Showcase.tsx` — the section: dark slate surfaces with gold accents,
  search, a family filter (Treatments / Shampoos / Serums), and a responsive card grid whose tiles
  carry a category chip, size badge, pack-quantity badge, price and a WhatsApp enquiry button, plus
  a branded fallback tile for any card without a photograph.
- `app/(public)/well10/page.tsx` — the route, with SEO metadata and `ItemList` structured data
  (name, brand, image, description, price only — see the caveats).
- A `Well10` entry in the header navigation and in `sitemap.ts`.
- `?strip=off` on `/api/product-image`, plus an optional third argument on `productImageSrc()`.

**Why the new route parameter.** The Well 10 photographs are the first source in this project that
carries **no** supplier watermark. The erasing boxes were measured against the colourpluscosmetics
set (v1.15), so on these images they removed real product content instead of a mark — clipping the
base of the Luxury Spa tub and its "1 LITRE" label. `strip=off` skips that single step per request
while the white canvas and the salon's mark still apply, so branded output is unchanged. The
default is untouched: `/shop` still strips.

**Verified**
- `tsc --noEmit --incremental false` clean; `npm run build` clean, `/well10` at 7.48 kB.
- 29 unit assertions run against the shipped catalogue module: the two figures (76 units and
  Rs 1,48,020), every filter and search combination, and the enquiry link's number and contents.
- Rendered output: all 9 titles, 9 cards, the counters, 9 enquiry links to the live business
  number, 3 fallback tiles and 1 representative-photo chip.
- No regression: `/well10` sends `strip=off` on every image request, `/shop` sends none on any of
  its 1,870.
- `npm run test:db` is unchanged at 64 passing assertions — this release touches no SQL.

**Caveats, stated plainly.** Three of the nine SKUs — both Brilliance Red jars and the No Yellow
Purple Shampoo — are not listed on the supplier's store, so they carry neither a photograph nor a
source link; their cards show a branded "Photo pending" tile rather than borrowing a picture of a
different product. The 50 ml serum uses the supplier's genuine Golden Serum shot with a
"Representative photo" chip, because the supplier pictures only the 100 ml. Prices are the shop's
own and differ from the supplier's retail in places (Rs 390 vs Rs 350 on the 100 ml serum) — that is
landed cost and margin, not a transcription error. The summary renders `Rs 1,48,020` in the
project's documented `en-IN` grouping.

**What this section deliberately cannot do.** It has no "add to cart". These SKUs are physically on
the shelf but have no `products` row, so an order for them would be rejected by the
`order_items` foreign key — the same failure mode v1.12 fixed for staff checkout. The call to action
is a WhatsApp enquiry quoting the catalogue price. Importing the range into the catalogue is what
unlocks checkout, and that is a write to the live database, so it needs the owner's go-ahead.

---

## v1.18 — The catalogue is replaced by the Well 10 range

At the owner's instruction, the live catalogue was cleared and rebuilt around the nine Well 10 SKUs.

**Delivered**
- **All 170 products deleted** from `public.products`, after taking a full snapshot to
  `backups/catalogue-before-well10-*.json` (products, categories, orders and order items).
- **The 7 generic categories deactivated** (Skincare, Makeup, Hair Care, Nail Care, Fragrance,
  Bath & Body, Tools & Accessories). Their rows remain; they no longer appear as shop filters.
- **One active category created: `Well10`**, and all nine products filed under it.
- **The 9 SKUs inserted** with the owner's exact names, prices, descriptions and stock counts —
  stock 1, 6, 15, 1, 7, 16, 12, 14, 4 (76 units, Rs 1,48,020 at cost-in-rack value).
- `ProductCard` now renders a **category chip** and an **availability badge carrying the unit
  count** ("16 in stock" / "Only 1 left" / "Out of stock"), so the card shows image, title,
  category, description, price and stock as the owner specified.
- The `/well10` showcase realigned to the same names, descriptions, prices and stock, and each card
  now hands off to its real product page (`/shop/<slug>`) instead of the supplier's site.

**The delete was safe by construction, and that was checked first.** `order_items.product_id` is
`ON DELETE SET NULL` (migration 0004) and every order item keeps its own `product_name` snapshot, so
deleting the catalogue did not disturb order history: all 7 items across the 5 orders survive, with
`product_id` nulled. No other table references `products`.

**Verified**
- Live database re-read after the write: 9 products, 1 active category, 0 leaked categories.
- Rendered `/shop`: 9 titles, 9 `Well10` chips, 9 availability badges matching the stock figures,
  9 descriptions, 9 prices, 9 product links; **0 occurrences** of any deactivated category name.
- Category filter offers exactly `All` + `Well10`.
- All 8 product photographs return `200 image/*` through `/api/product-image` — including the two
  new retailer hosts (Daraz Nepal, Flipkart), which were not previously used by this project.
- A product detail page renders its title, price, stock and description.
- `tsc --noEmit --incremental false` clean; `--noUnusedLocals` clean; `npm run build` clean.
- 9 unit assertions against the catalogue module pass, including that its stock and price figures
  match the database row for row.

**Caveats, stated plainly.** (1) The No Yellow Purple Shampoo has no photograph, because none exists
on any public listing — its card shows the shop placeholder until a real photo arrives. (2) The
`/well10` showcase now carries a **second copy** of the stock numbers; `public.products` is the
system of record, so a console stock edit must be mirrored in `lib/well10-catalog.ts`. Pointing the
showcase at the database instead is the durable fix, and was out of scope here. (3) All nine rows
are flagged `is_featured = true` so the home page's featured rail is not left empty by the wipe —
that is a merchandising choice, not a requirement, and is easy to change. (4) The golden serum 50 ml
uses the 100 ml photograph, flagged in the showcase; the shop card itself cannot flag it.

---

## v1.19 — Admin-configurable watermark badge

**Delivered**
- **Migration 0019** adds `watermark_enabled` (default `true`), `watermark_logo_url` and
  `watermark_size_px` (default `44`, `CHECK 32–64`) to `salon_settings`. Applied to the live project.
- **`WatermarkSettingsCard`** on the admin Settings page: drag-and-drop or click to upload a **PNG
  only** (validated for MIME type and the bucket's 8 MB ceiling before the request), live preview
  rendered against a half-white/half-dark swatch, replace, delete, an on/off switch and a 32–64px
  slider. Every control writes immediately.
- **`WatermarkBadge`** overlays the uploaded PNG at the bottom-left of the product image on the shop
  grid, category pages and the product page — `absolute bottom-2 left-2 z-10 pointer-events-none`,
  proportional width, `max-height` from the slider, and
  `filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3))`.
- `?mark=off` on `/api/product-image`, plus a `brandMark` option on `productImageSrc`.

**Why the new route parameter — the important part.** This project already baked the salon mark into
every product image at bottom-left (`BRAND_MARK`, measured and tuned in v1.13–v1.16). Adding the
overlay on top would have printed **two logos** on every card. So the surfaces named in the request
now draw the badge in the DOM and request their image with `mark=off`, while every surface that has
no overlay — `og:image` link previews, order confirmations, WhatsApp order messages, cart lines and
the admin tables — keeps the baked mark. One logo in each place, never two, and no surface lost its
branding.

The card is deliberately **outside** the page's `SettingsForm`. That form is a single write path
that patches every other field on save; folding the watermark in would let an unrelated Save later in
the session revert a logo that had just been uploaded.

Uploads reuse the public `gallery` bucket under a `brand/` prefix (`uploadBrandLogo`), rather than a
new bucket or `uploadGalleryImage`, whose `category` parameter is a closed union of service
categories that "brand" is not part of. Replacing or deleting a logo also removes the file it
replaced, guarded so it only ever touches objects under our own `gallery/brand/` path.

**Verified against the live project**
- Migration applied; columns, defaults and the check constraint read back from the database.
- With a real uploaded PNG at size 44: the overlay renders with `bottom-2 left-2 z-10
  pointer-events-none`, the drop shadow, `max-height:44px`, `alt=""` and `aria-hidden="true"`, on
  both the shop grid and a product page; all 88 product-image requests carried `mark=off`.
- `og:image` on the same page does **not** carry `mark=off` — the baked mark is intact for shares.
- Switch off → 0 overlays and 0 `mark=off`, so the baked mark returns and branding never disappears.
- Slider at 64 → `max-height:64px`. A direct write of `watermark_size_px = 999` was rejected by the
  database (`23514`).
- `tsc --noEmit --incremental false` clean, `--noUnusedLocals` clean, `npm run build` clean.
- Defaults restored afterwards and the verification object deleted; `gallery/brand/` is empty.

**Boundaries, stated plainly.** (1) The `/well10` brand page keeps its baked mark and has no overlay
— it is a brand presentation rather than the catalogue, and its cards already carry a
"Representative photo" chip in the same bottom-left corner that the badge would collide with. (2) The
uploaded logo drives the overlay only; the baked mark on shares and order views still uses the
bundled `public/brand/abh-logo.png`, so uploading a *different* mark would show two different logos
on different surfaces. Pointing the pipeline at `watermark_logo_url` is the fix and is a small
follow-up. (3) The admin card is verified by build, by TypeScript and by exercising the exact
Storage and settings writes it performs — not by clicking it in a browser, which is unavailable in
this environment. (4) `npm run test:db` could not be executed here: local Postgres is not installed
on this host.

---

## v1.20 — Owner's logo live, and low-stock alerting

**The supplied PNG was not usable as-is, and that is the headline.** `270858.png` arrived as a
1000×1000 PNG with **no alpha channel** — 99.1% of its pixels were solid black and the artwork
occupied 0.9% of the frame. Dropped into the badge it would have painted a **black rectangle** into
the bottom-left of every product photo, and the 76% empty border would have shrunk the visible mark
to roughly a third of the configured height. It was converted to a real watermark before upload:
alpha taken from the brightest channel (black → transparent, gold and pink preserved), then trimmed
to the artwork with a 6px margin — 254×210, alpha range 0…254.

**Delivered**
- The cleaned logo uploaded through the same `gallery/brand/` path the admin card uses, and
  `watermark_logo_url` / `watermark_enabled` / `watermark_size_px` (44) written to `salon_settings`.
  Live on the shop: 9 badges, 88/88 product-image requests carrying `mark=off`.
- **Low-stock alerting** for the admin console: `lib/stock-alerts.ts` (pure helpers and the WhatsApp
  message builder), `getLowStockProducts()` in `lib/api-client.ts`, and `LowStockAlert` in the admin
  toolbar — a count chip, a panel listing what needs restocking, a synthesised two-tone chime, and a
  one-tap WhatsApp message to the owner.

**Two things the request assumed that are not true, checked rather than assumed**
1. **Payment statements are already saved.** `uploadPaymentProof` exists, `payment-proofs` is a
   private bucket (images + PDF, 5 MB), `orders.payment_proof_url` holds the path, the admin orders
   page renders it through a signed URL, and the order's WhatsApp message already says the
   screenshot is in the dashboard. No new work was needed.
2. **Nothing in this project sends WhatsApp messages by itself.** There is no Business API provider
   anywhere in the dependency tree — every message is a `wa.me` link a human taps. So the stock
   alert raises itself in the console and offers a pre-filled message; genuinely automatic sending
   needs a provider and credentials, which is a decision, not a coding task.

**Verified**
- Live shop: 9 badges with the correct CSS (`absolute bottom-2 left-2 z-10 pointer-events-none`,
  drop shadow, `max-height:44px`, `alt=""`), 88/88 requests with `mark=off`, asset returns
  `200 image/png`.
- Alert set read back from the live database: 3 of 9 products flagged (Luxury Spa 1 left, Hair Botox
  1 left, No Yellow Purple 4 left); the six healthy lines stay quiet.
- 14 unit assertions against `lib/stock-alerts.ts`: threshold boundary, zero-stock inclusion, sort
  order and non-mutation, message wording and singular/plural, and the null cases for a missing
  number and an empty list.
- `tsc --noEmit --incremental false` clean, `--noUnusedLocals` clean, `npm run build` clean.

**On the chime.** Browsers refuse to start audio before a user gesture, so the `AudioContext` is
created suspended and resumed on the first interaction in the console, with the preference
remembered per browser and a toggle in the panel. It sounds once per distinct set of shortages, not
once per poll, so the 60-second refresh cannot turn into a metronome. This is verified by
construction and unit test only — the actual sound cannot be heard in this environment.

**Still outstanding from the same request:** per-bank-account names and QR codes with add/remove
(today there is a single `payment_qr_image_url`), and multiple categorised announcements (today a
single `announcement_text`).

---

## v1.21 — Square white product cards, real galleries, hover reveal

**Delivered**
- **Card frames are square** (`aspect-square`, `object-contain`) instead of 4:3. Every catalogue
  photo is a square packshot, so the frame now fits them exactly and the product is larger.
- **A grounding shadow** at the base of each product, drawn as a wide low ellipse. It sits *over*
  the photo, not behind it: packshots are opaque white squares, so a shadow underneath would simply
  be hidden by the image. See the note in `ProductCard`.
- **Hover reveal on the grid**: the image scales to 105% over 500ms, the frame crossfades to the
  next angle, and the card lifts on the project's own `shadow-lift` token. The zoom and the fade
  share one scaling wrapper so they cannot fight each other.
- **Quick-view dots** (bottom-right, clear of the brand badge) to flick between angles in the grid —
  also the only way to reach them on a touch screen, where there is no hover. Each dot sits inside
  the card's link, so a click has to stop the navigation it would otherwise trigger.
- **Multi-image gallery in the admin form** (`ProductImagesUpload` replacing the single-image
  `ProductImageUpload`): drag-and-drop or select several files at once, thumbnails, make-primary,
  reorder, delete, and the paste-a-URL path kept. Files upload in sequence with per-file progress
  rather than in a burst, so a partial failure keeps what did upload and names what did not.
- **Product page gallery** (`ProductGallery`): one viewport with zoom-on-hover, a thumbnail strip
  below on phones and beside on desktop, prev/next controls, a frame counter, and swipe.
- **Baked colour normalisation** in the image pipeline — `saturation: 1.05` and `linear(1.03, -4)`,
  applied to the flattened white canvas. Supplier packshots arrive at inconsistent exposures and sit
  side by side on the grid, where the difference reads as sloppiness. Kept deliberately modest: the
  brief is "crisp and true to life", and packaging colour is a claim customers check against the
  physical product.

**The data model did not need a migration.** `products.images` is already `JSONB` typed as
`string[]`, and `image_url` already existed. **The gallery is now the single source of truth**:
`images[0]` *is* the primary image, and `image_url` is written from it on save. The form previously
did the opposite — it derived `images` from the single `image_url` — so an uploaded gallery would
have been silently discarded on save. A separate "primary" flag would have allowed the two columns
to disagree; instead, promoting a photo moves it to the front.

**Verified**
- Live shop grid: 9 square frames, 9 zoom wrappers, 9 grounding shadows, and the `group`/lift
  classes present. The crossfade layer and quick-view dots appear on **exactly one** card — the only
  product with two images — and nowhere else, which is the correct behaviour for single-photo rows.
- Product page: 2 thumbnails, correct `aria-current`, 2 prev/next controls, and a `1 / 2` counter.
- A **genuine second angle** was added to the Luxury Spa tub from the supplier's own product page
  (lid open, cream texture) — real photography, not filler. With one image per product the reveal
  and the dots can never render, so the feature was otherwise untestable.
- Colour pass measured on the same source: mean RGB `228.1 / 217.2 / 214.6` → `229.1 / 217.9 /
  214.9`, and read back side by side. A gentle, natural shift rather than a correction.
- `tsc --noEmit --incremental false` clean, `--noUnusedLocals` clean, `npm run build` clean.
- `npm run test:db` not re-run: this release contains no SQL.

**Boundaries, stated plainly.** (1) Eight of the nine products still have a single photograph, so
the hover reveal and dots stay dormant for them until more are uploaded — the behaviour is verified,
the content is not yet there. (2) The grounding shadow is a CSS overlay, so it appears on the grid
and product page but not in link previews or order confirmations, which use the raw image. (3) Swipe
and hover cannot be exercised in this environment; they are verified by markup and unit-level
reasoning, not by gesture.
