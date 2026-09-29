#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# Applies every migration to a throwaway PostgreSQL database and verifies both the business
# rules and the row-level security — no Docker, no Supabase CLI, no hosted project needed.
#
#   bash supabase/local/run-local-tests.sh
#
# Requires PostgreSQL 14+ installed locally. Creates (and drops) a database called
# `alikati_test` — it does not touch anything else. Exits non-zero if any assertion fails.
# ═════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# Keeps `su`/perl locale warnings out of the captured output.
export LC_ALL=C LANG=C

DB="${DB:-alikati_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILURES=0
PASSES=0

# Running as root (containers/CI) means psql must run as the postgres OS user; otherwise the
# current user is used directly.
if [ "$(id -u)" = "0" ]; then
  as_sql() { su postgres -c "$1"; }
else
  as_sql() { bash -c "$1"; }
fi

# SQL is piped on stdin rather than passed by path: the database user then never needs read
# access to the repository (which fails when the checkout sits under a 0700 home directory).
psql_run() { as_sql "psql -q -d $DB -v ON_ERROR_STOP=1 -f -"; }

# Captures stdout only, so a stray warning on stderr cannot corrupt a comparison.
scalar() {
  printf '%s\n' "$1" | as_sql "psql -tAq -d $DB -f -" 2>/dev/null \
    | tr -d '\r' | tr '\n' ' ' | sed 's/[[:space:]]*$//'
}

expect() { # label, expected, sql
  local label="$1" expected="$2" sql="$3" got
  got="$(scalar "$sql")"
  if [ "$got" = "$expected" ]; then
    printf '  \033[32mPASS\033[0m  %s\n' "$label"; PASSES=$((PASSES + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s\n        expected: %s\n        got:      %s\n' "$label" "$expected" "$got"
    FAILURES=$((FAILURES + 1))
  fi
}

expect_denied() { # label, sql  — must raise
  local label="$1" sql="$2"
  if printf '%s\n' "$sql" | as_sql "psql -q -d $DB -v ON_ERROR_STOP=1 -f -" >/dev/null 2>&1; then
    printf '  \033[31mFAIL\033[0m  %s — statement was ALLOWED but should have been denied\n' "$label"
    FAILURES=$((FAILURES + 1))
  else
    printf '  \033[32mPASS\033[0m  %s (correctly denied)\n' "$label"; PASSES=$((PASSES + 1))
  fi
}

expect_allowed() { # label, sql — must succeed
  local label="$1" sql="$2"
  if printf '%s\n' "$sql" | as_sql "psql -q -d $DB -v ON_ERROR_STOP=1 -f -" >/dev/null 2>&1; then
    printf '  \033[32mPASS\033[0m  %s\n' "$label"; PASSES=$((PASSES + 1))
  else
    printf '  \033[31mFAIL\033[0m  %s — statement was DENIED but should have been allowed\n' "$label"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "── 1. fresh database ─────────────────────────────────────────────────────"
as_sql "dropdb --if-exists $DB" >/dev/null 2>&1
# Prefer a UTF8 database so varchar(n) counts CHARACTERS, as it does on Supabase. A SQL_ASCII
# cluster counts bytes instead and reports misleading 'value too long' errors for accented text.
if ! as_sql "createdb -E UTF8 -T template0 $DB" >/dev/null 2>&1; then
  as_sql "createdb $DB" >/dev/null 2>&1 || { echo "could not create $DB"; exit 1; }
fi
echo "   $DB created"

echo "── 2. Supabase shim ──────────────────────────────────────────────────────"
psql_run < "$HERE/00-shim-pre.sql" >/dev/null || { echo "shim failed"; exit 1; }
echo "   roles, auth + storage schemas ready"

echo "── 3. migrations (in order) ──────────────────────────────────────────────"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  if psql_run < "$migration" >"$TMP/out.txt" 2>&1; then
    printf '   \033[32m✔\033[0m %s\n' "$name"
  else
    printf '   \033[31m✘ %s FAILED\033[0m\n' "$name"
    sed 's/^/        /' "$TMP/out.txt" | tail -12
    echo; echo "Migration failed — stopping."; exit 1
  fi
done

echo "── 4. functional assertions ──────────────────────────────────────────────"
if psql_run < "$HERE/10-functional.sql" >"$TMP/fn.txt" 2>&1; then
  grep -E "NOTICE|✔" "$TMP/fn.txt" | sed 's/^NOTICE:  /   ✔ /' | sed 's/^psql:.*NOTICE:  /   ✔ /'
  PASSES=$((PASSES + 20))
else
  echo "   ✘ functional assertions FAILED:"
  sed 's/^/        /' "$TMP/fn.txt" | tail -20
  FAILURES=$((FAILURES + 1))
fi

echo "── 5. row-level security ─────────────────────────────────────────────────"

# An inactive product, to prove the public read policy actually filters.
scalar "INSERT INTO public.products (name, slug, sku, price_npr, stock_qty, is_active, images, tags)
        VALUES ('Hidden Product','hidden-product','HID-1',900,5,FALSE,'[]'::jsonb,'[]'::jsonb);" >/dev/null

# --- the public (anon) role -------------------------------------------------
expect "anon sees only active products"          "2" "SET ROLE anon; SELECT count(*) FROM public.products;"
expect "anon cannot read orders"                 "0" "SET ROLE anon; SELECT count(*) FROM public.orders;"
expect "anon cannot read order items"            "0" "SET ROLE anon; SELECT count(*) FROM public.order_items;"
expect "anon cannot read appointments"           "0" "SET ROLE anon; SELECT count(*) FROM public.appointments;"
expect "anon cannot read customers"              "0" "SET ROLE anon; SELECT count(*) FROM public.customers;"
expect "anon cannot read the academy leads"      "0" "SET ROLE anon; SELECT count(*) FROM public.academy_leads;"
expect "anon can read active services"           "1" "SET ROLE anon; SELECT count(*) FROM public.services;"
expect "anon can read salon settings"            "1" "SET ROLE anon; SELECT count(*) FROM public.salon_settings;"

expect "anon cannot read coupons (list is secret)" "0" "SET ROLE anon; SELECT count(*) FROM public.coupons;"
expect "anon cannot read affiliates"               "0" "SET ROLE anon; SELECT count(*) FROM public.affiliates;"

expect_denied  "anon cannot insert an order directly" \
  "SET ROLE anon; INSERT INTO public.orders (reference, customer_name, customer_phone, delivery_address, delivery_city, subtotal_npr, shipping_npr, total_npr) VALUES ('HACK-1','X','9800000000','x','Attariya',1,0,1);"

# RLS filters rows silently instead of raising, so a blocked UPDATE/DELETE still exits 0.
# These assertions therefore check that nothing changed, using RESET ROLE to read as the owner.
expect "anon cannot change a product price" "500" \
  "SET ROLE anon; UPDATE public.products SET price_npr = 1 WHERE slug = 'verification-cream'; RESET ROLE; SELECT price_npr::int FROM public.products WHERE slug = 'verification-cream';"

expect "anon cannot delete a product" "1" \
  "SET ROLE anon; DELETE FROM public.products WHERE slug = 'verification-cream'; RESET ROLE; SELECT count(*) FROM public.products WHERE slug = 'verification-cream';"

expect "anon cannot deactivate a service" "t" \
  "SET ROLE anon; UPDATE public.services SET is_active = FALSE WHERE slug = 'verification-service'; RESET ROLE; SELECT is_active FROM public.services WHERE slug = 'verification-service';"

expect_denied  "anon cannot promote itself to admin" \
  "SET ROLE anon; INSERT INTO public.profiles (id, email, full_name, role) VALUES (gen_random_uuid(),'x@y.z','X','admin');"

expect_allowed "anon CAN apply to the affiliate programme (pending, with an account)" \
  "SET ROLE anon; INSERT INTO public.affiliates (name, phone, code, status, instagram_url) VALUES ('Applicant','9811111111','APPL-X','pending','https://www.instagram.com/applicant');"

# 0017: the programme is reviewed on the applicant's audience, so an application with no account
# is not reviewable and never reaches the table.
expect_denied  "anon cannot apply with no social account at all" \
  "SET ROLE anon; INSERT INTO public.affiliates (name, phone, code, status) VALUES ('NoSocial','9811111119','NOSOC','pending');"

expect_denied  "anon cannot apply with a link that is not a profile on that network" \
  "SET ROLE anon; INSERT INTO public.affiliates (name, phone, code, status, instagram_url) VALUES ('BadLink','9811111120','BADLINK','pending','https://example.com/notinstagram');"

# The next two carry a valid account on purpose. Without it they would fail on the social
# requirement instead of the guard under test — a test that passes for the wrong reason.
expect_denied  "anon cannot self-approve an affiliate" \
  "SET ROLE anon; INSERT INTO public.affiliates (name, phone, code, status, instagram_url) VALUES ('Cheat','9811111112','CHEAT','active','https://www.instagram.com/cheat');"

expect_denied  "anon cannot fabricate affiliate earnings" \
  "SET ROLE anon; INSERT INTO public.affiliates (name, phone, code, status, total_earned_npr, instagram_url) VALUES ('Cheat','9811111113','CHEAT2','pending',99999,'https://www.instagram.com/cheat2');"

expect_allowed "anon CAN book an appointment" \
  "SET ROLE anon; INSERT INTO public.appointments (client_name, client_phone, service_id, booking_date, booking_time, total_amount_npr, status, is_walk_in) SELECT 'Web Guest','9812345678', id, current_date + 3, '11:00'::time, 1000, 'pending', FALSE FROM public.services LIMIT 1;"

expect "anon cannot self-confirm or mark a booking walk-in" "0" \
  "SET ROLE anon; INSERT INTO public.appointments (client_name, client_phone, service_id, booking_date, booking_time, total_amount_npr, status, is_walk_in) SELECT 'Web Guest','9812345679', id, current_date + 4, '11:30'::time, 1000, 'confirmed', TRUE FROM public.services LIMIT 1; RESET ROLE; SELECT count(*) FROM public.appointments WHERE client_phone = '9812345679';"

# --- customer reviews are moderated before they reach the site ---------------
# Publish one as the owner first, so "anon sees 1" cannot pass merely because the table is empty.
scalar "UPDATE public.reviews SET is_approved = TRUE, approved_at = now() WHERE author_name = 'Sita J.';" >/dev/null

expect "anon sees only the approved review (5 pending stay hidden)" "1" \
  "SET ROLE anon; SELECT count(*) FROM public.reviews;"

expect "anon cannot read a pending review" "0" \
  "SET ROLE anon; SELECT count(*) FROM public.reviews WHERE author_name = 'Mina R.';"

expect_allowed "anon CAN submit a review" \
  "SET ROLE anon; INSERT INTO public.reviews (author_name, rating, body) VALUES ('Web Guest', 5, 'A perfectly ordinary review body.');"

expect_denied "anon cannot submit an already-approved review" \
  "SET ROLE anon; INSERT INTO public.reviews (author_name, rating, body, is_approved, approved_at) VALUES ('Cheat', 5, 'Straight onto the homepage please.', TRUE, now());"

expect_denied "anon cannot stamp an approval timestamp on a pending review" \
  "SET ROLE anon; INSERT INTO public.reviews (author_name, rating, body, approved_at) VALUES ('Cheat', 5, 'Nearly, but not quite.', now());"

expect "anon cannot approve a review by updating it" "0" \
  "SET ROLE anon; UPDATE public.reviews SET is_approved = TRUE, approved_at = now() WHERE author_name = 'Anita P.'; RESET ROLE; SELECT count(*) FROM public.reviews WHERE author_name = 'Anita P.' AND is_approved;"

expect "anon cannot delete a review" "1" \
  "SET ROLE anon; DELETE FROM public.reviews WHERE author_name = 'Sita J.'; RESET ROLE; SELECT count(*) FROM public.reviews WHERE author_name = 'Sita J.';"

# RLS is row-level, so this column grant is the only thing keeping the moderation trail private.
expect_denied "anon cannot select the approving staff id" \
  "SET ROLE anon; SELECT approved_by FROM public.reviews;"

# --- a signed-in customer who is not staff ----------------------------------
expect "a plain signed-in user cannot read orders" "0" \
  "SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'; SET ROLE authenticated; SELECT count(*) FROM public.orders;"

# --- staff ------------------------------------------------------------------
STAFF_ID="$(scalar "SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1;")"
expect "staff can read the order book" "2" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT count(*) FROM public.orders;"
expect "staff can read appointments" "5" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT count(*) FROM public.appointments;"
expect "staff can read coupons" "1" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT count(*) FROM public.coupons;"
expect "staff can read the customer list" "1" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT count(*) FROM public.customers;"
expect "staff can read an applicant's social accounts" "https://www.instagram.com/applicant" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT instagram_url FROM public.affiliates WHERE code='APPL-X';"

expect "staff can approve an affiliate" "active" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; UPDATE public.affiliates SET status='active' WHERE code='APPL-X'; SELECT status FROM public.affiliates WHERE code='APPL-X';"
expect "staff can adjust stock" "7" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; UPDATE public.products SET stock_qty=7 WHERE slug='verification-cream'; SELECT stock_qty FROM public.products WHERE slug='verification-cream';"

expect "staff can read the whole review queue" "7" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; SELECT count(*) FROM public.reviews;"

expect "staff can publish a waiting review" "t" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; UPDATE public.reviews SET is_approved = TRUE, approved_at = now() WHERE author_name = 'Anita P.'; SELECT is_approved FROM public.reviews WHERE author_name = 'Anita P.';"

expect "staff cannot approve without a timestamp" "f" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; DO \$\$ BEGIN UPDATE public.reviews SET is_approved = TRUE, approved_at = NULL WHERE author_name = 'Mina R.'; EXCEPTION WHEN check_violation THEN NULL; END \$\$; SELECT is_approved FROM public.reviews WHERE author_name = 'Mina R.';"

expect "staff can delete a review" "0" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; DELETE FROM public.reviews WHERE author_name = 'Web Guest'; SELECT count(*) FROM public.reviews WHERE author_name = 'Web Guest';"

# --- storage -----------------------------------------------------------------
expect_denied "anon cannot write to a storage bucket" \
  "SET ROLE anon; INSERT INTO storage.objects (bucket_id, name) VALUES ('gallery','hack/evil.jpg');"

expect_allowed "staff can upload product media" \
  "SET request.jwt.claim.sub = '$STAFF_ID'; SET ROLE authenticated; INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('products','skincare/2026-09/ok.jpg', '$STAFF_ID');"

echo
echo "══════════════════════════════════════════════════════════════════════════"
if [ "$FAILURES" -eq 0 ]; then
  printf '  \033[32mALL CHECKS PASSED\033[0m — %d assertions\n' "$PASSES"
else
  printf '  \033[31m%d FAILED\033[0m out of %d assertions\n' "$FAILURES" "$((PASSES + FAILURES))"
fi
echo "══════════════════════════════════════════════════════════════════════════"
exit $([ "$FAILURES" -eq 0 ] && echo 0 || echo 1)
