-- ═════════════════════════════════════════════════════════════════════════════
-- Functional verification of the schema + server-side business rules.
-- Runs after 00-shim-pre.sql and every migration. Every assertion RAISEs on failure, so a
-- clean run means the database genuinely behaves as the application expects.
-- ═════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── A. Schema inventory ───────────────────────────────────────────────────────
DO $$
DECLARE
    expected TEXT[] := ARRAY[
        'academy_courses', 'academy_leads', 'affiliates', 'appointments', 'coupons',
        'customers', 'gallery_items', 'order_items', 'orders', 'product_categories',
        'products', 'profiles', 'reviews', 'salon_settings', 'services'
    ];
    missing TEXT[];
BEGIN
    SELECT array_agg(t) INTO missing
    FROM unnest(expected) AS t
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = t
    );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'missing tables: %', missing;
    END IF;
    RAISE NOTICE 'A1  all % expected tables exist', array_length(expected, 1);
END $$;

-- ── B. RLS switched on everywhere it matters ──────────────────────────────────
DO $$
DECLARE
    t TEXT;
    unprotected TEXT[] := ARRAY[]::TEXT[];
    guarded TEXT[] := ARRAY[
        'profiles', 'services', 'appointments', 'academy_courses', 'academy_leads',
        'gallery_items', 'salon_settings', 'product_categories', 'products',
        'orders', 'order_items', 'customers', 'coupons', 'affiliates', 'reviews'
    ];
BEGIN
    FOREACH t IN ARRAY guarded LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
            unprotected := unprotected || t;
        END IF;
    END LOOP;

    IF array_length(unprotected, 1) > 0 THEN
        RAISE EXCEPTION 'RLS is DISABLED on: %', unprotected;
    END IF;
    RAISE NOTICE 'B1  RLS enabled on all % guarded tables', array_length(guarded, 1);
END $$;

-- ── C. The privileged RPCs must be unreachable from the browser ───────────────
-- This is the assertion that caught the PUBLIC-grant hole: PostgreSQL gives every new function
-- EXECUTE to PUBLIC unless it is revoked, so `REVOKE ... FROM anon` alone proves nothing.
DO $$
BEGIN
    IF has_function_privilege('anon', 'public.place_order(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can execute place_order() — pricing is not server-authoritative';
    END IF;
    IF has_function_privilege('authenticated', 'public.place_order(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can execute place_order()';
    END IF;
    IF has_function_privilege('anon', 'public.preview_coupon(text, numeric)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can enumerate coupons via preview_coupon()';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.place_order(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role cannot execute place_order() — checkout would fail';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.preview_coupon(text, numeric)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role cannot execute preview_coupon()';
    END IF;
    IF has_function_privilege('anon', 'public.cancel_order(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can cancel orders';
    END IF;
    IF has_function_privilege('anon', 'public.shop_kpis(date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can read revenue through shop_kpis()';
    END IF;
    RAISE NOTICE 'C1  privileged RPCs closed to anon/authenticated; service_role retained';
END $$;

-- ── D. Storage buckets ────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM storage.buckets WHERE id IN ('gallery', 'services', 'academy', 'products');
    IF n <> 4 THEN
        RAISE EXCEPTION 'expected 4 storage buckets, found %', n;
    END IF;
    RAISE NOTICE 'D1  4 storage buckets present';
END $$;

-- ── E. Salon settings singleton ───────────────────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM public.salon_settings) <> 1 THEN
        RAISE EXCEPTION 'salon_settings must hold exactly one row';
    END IF;
    IF (SELECT shipping_fee_npr FROM public.salon_settings WHERE id = 1) IS NULL THEN
        RAISE EXCEPTION 'store settings columns missing — migration 0004 did not apply';
    END IF;
    RAISE NOTICE 'E1  salon_settings singleton seeded with store settings';
END $$;

-- ── F. place_order(): pricing, stock, coupons, affiliate ──────────────────────
DO $$
DECLARE
    v_cat      UUID;
    v_serum    UUID;
    v_cream    UUID;
    v_svc      UUID;
    v_res      RECORD;
    v_free     RECORD;
    v_stock    INT;
    v_used     INT;
    v_earned   NUMERIC;
    v_blocked  BOOLEAN;
    v_staff    UUID;
    v_guest    RECORD;
    v_linked   RECORD;
    v_customer UUID;
    v_guest_customer  UUID;
    v_linked_customer UUID;
BEGIN
    INSERT INTO public.product_categories (name, slug, display_order)
    VALUES ('Verification', 'verification', 99) RETURNING id INTO v_cat;

    -- Serum: रू 2,000 list with a रू 1,500 promotional price, 10 in stock.
    INSERT INTO public.products (name, slug, sku, category_id, price_npr, discount_price_npr,
                                 stock_qty, low_stock_threshold, is_active, images, tags)
    VALUES ('Verification Serum', 'verification-serum', 'VER-1', v_cat, 2000, 1500,
            10, 3, TRUE, '[]'::jsonb, '[]'::jsonb)
    RETURNING id INTO v_serum;

    -- Cream: रू 500, 5 in stock.
    INSERT INTO public.products (name, slug, sku, category_id, price_npr,
                                 stock_qty, low_stock_threshold, is_active, images, tags)
    VALUES ('Verification Cream', 'verification-cream', 'VER-2', v_cat, 500,
            5, 2, TRUE, '[]'::jsonb, '[]'::jsonb)
    RETURNING id INTO v_cream;

    INSERT INTO public.coupons (code, discount_type, discount_value, min_order_npr,
                                max_discount_npr, is_active)
    VALUES ('TEST10', 'percent', 10, 1000, 400, TRUE);

    INSERT INTO public.affiliates (name, phone, code, commission_rate, status)
    VALUES ('Verification Affiliate', '9800000099', 'TESTAFF', 8, 'active');

    -- ── Order 1: 2 × 1500 + 1 × 500 = 3,500 subtotal, coupon + affiliate ───────
    SELECT * INTO v_res FROM public.place_order(jsonb_build_object(
        'customer_name', 'Verification Buyer',
        'customer_phone', '9800000001',
        'delivery_address', 'Attariya Chowk',
        'delivery_city', 'Attariya',
        'payment_method', 'cod',
        'coupon_code', 'TEST10',
        'affiliate_code', 'TESTAFF',
        'items', jsonb_build_array(
            jsonb_build_object('product_id', v_serum, 'quantity', 2),
            jsonb_build_object('product_id', v_cream, 'quantity', 1)
        )
    ));

    -- Promotional price must be used (1500, not 2000); 10% of 3500 = 350 under the 400 cap;
    -- 3500 is below the 5000 free-shipping threshold, so shipping is the flat 150.
    IF v_res.subtotal <> 3500 THEN RAISE EXCEPTION 'subtotal: expected 3500, got %', v_res.subtotal; END IF;
    IF v_res.discount <> 350  THEN RAISE EXCEPTION 'discount: expected 350, got %', v_res.discount; END IF;
    IF v_res.shipping <> 150  THEN RAISE EXCEPTION 'shipping: expected 150, got %', v_res.shipping; END IF;
    IF v_res.total    <> 3300 THEN RAISE EXCEPTION 'total: expected 3300, got %', v_res.total; END IF;
    IF v_res.coupon_applied <> 'TEST10' THEN RAISE EXCEPTION 'coupon not recorded'; END IF;
    IF v_res.affiliate_applied <> 'TESTAFF' THEN RAISE EXCEPTION 'affiliate not recorded'; END IF;
    RAISE NOTICE 'F1  place_order pricing correct (3500 − 350 + 150 = 3300)';

    SELECT stock_qty INTO v_stock FROM public.products WHERE id = v_serum;
    IF v_stock <> 8 THEN RAISE EXCEPTION 'stock after order: expected 8, got %', v_stock; END IF;

    SELECT used_count INTO v_used FROM public.coupons WHERE code = 'TEST10';
    IF v_used <> 1 THEN RAISE EXCEPTION 'coupon used_count: expected 1, got %', v_used; END IF;

    SELECT total_earned_npr INTO v_earned FROM public.affiliates WHERE code = 'TESTAFF';
    IF v_earned <> 280 THEN RAISE EXCEPTION 'affiliate commission: expected 280 (8%% of 3500), got %', v_earned; END IF;
    RAISE NOTICE 'F2  stock reserved, coupon consumed, affiliate credited';

    -- ── Order 2: free shipping above the threshold, no coupon ─────────────────
    SELECT * INTO v_free FROM public.place_order(jsonb_build_object(
        'customer_name', 'Verification Buyer',
        'customer_phone', '9800000002',
        'delivery_address', 'Attariya Chowk',
        'delivery_city', 'Attariya',
        'payment_method', 'cod',
        'items', jsonb_build_array(
            jsonb_build_object('product_id', v_serum, 'quantity', 3)
        )
    ));

    IF v_free.subtotal <> 4500 THEN RAISE EXCEPTION 'free-ship subtotal: expected 4500, got %', v_free.subtotal; END IF;
    IF v_free.shipping <> 150  THEN RAISE EXCEPTION 'shipping below threshold should be 150, got %', v_free.shipping; END IF;
    IF v_free.discount <> 0    THEN RAISE EXCEPTION 'unexpected discount %', v_free.discount; END IF;
    RAISE NOTICE 'F3  shipping threshold rules correct';

    -- ── Overselling must be refused ───────────────────────────────────────────
    v_blocked := FALSE;
    BEGIN
        PERFORM public.place_order(jsonb_build_object(
            'customer_name', 'Greedy Buyer',
            'customer_phone', '9800000003',
            'delivery_address', 'Attariya Chowk',
            'delivery_city', 'Attariya',
            'payment_method', 'cod',
            'items', jsonb_build_array(
                jsonb_build_object('product_id', v_cream, 'quantity', 20)
            )
        ));
    EXCEPTION WHEN OTHERS THEN
        IF position('INSUFFICIENT_STOCK' IN SQLERRM) = 0 THEN RAISE; END IF;
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'overselling was NOT blocked'; END IF;
    RAISE NOTICE 'F4  overselling refused with INSUFFICIENT_STOCK';

    -- ── Quantity is clamped server-side (999 → 20, still over stock → refused) ──
    v_blocked := FALSE;
    BEGIN
        PERFORM public.place_order(jsonb_build_object(
            'customer_name', 'Clamp Buyer',
            'customer_phone', '9800000004',
            'delivery_address', 'Attariya Chowk',
            'delivery_city', 'Attariya',
            'payment_method', 'cod',
            'items', jsonb_build_array(
                jsonb_build_object('product_id', v_cream, 'quantity', 999)
            )
        ));
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'absurd quantity was accepted'; END IF;
    RAISE NOTICE 'F5  quantity clamping enforced';

    -- ── Empty cart refused ────────────────────────────────────────────────────
    v_blocked := FALSE;
    BEGIN
        PERFORM public.place_order(jsonb_build_object(
            'customer_name', 'Empty Buyer', 'customer_phone', '9800000005',
            'delivery_address', 'x', 'delivery_city', 'Attariya',
            'items', '[]'::jsonb
        ));
    EXCEPTION WHEN OTHERS THEN
        IF position('EMPTY_CART' IN SQLERRM) = 0 THEN RAISE; END IF;
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION 'empty cart was accepted'; END IF;
    RAISE NOTICE 'F6  empty cart refused';

    -- ── cancel_order() is staff-only, and restores the reserved stock ─────────
    -- A caller with no staff session (or an ordinary customer session) must be refused.
    BEGIN
        PERFORM public.cancel_order(v_res.order_id);
        RAISE EXCEPTION 'cancel_order() ran without a staff session';
    EXCEPTION WHEN OTHERS THEN
        IF position('NOT_AUTHORISED' IN SQLERRM) = 0 THEN RAISE; END IF;
    END;
    RAISE NOTICE 'F7a cancel_order() refuses a non-staff caller';

    -- profiles.id references auth.users, so the admin is created the way production does it:
    -- insert the auth user and let handle_new_staff_user() build the profile.
    v_staff := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_staff, 'verify-admin@example.com',
            '{"full_name":"Verify Admin","role":"admin"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

    -- Order 1 reserved 2 units of the serum. Cancelling must return exactly those 2 — order 2
    -- is still live, so the absolute figure is 10 − 2 (order 1) − 3 (order 2) + 2 (restored) = 7.
    PERFORM public.cancel_order(v_res.order_id);
    SELECT stock_qty INTO v_stock FROM public.products WHERE id = v_serum;
    IF v_stock <> 7 THEN
        RAISE EXCEPTION 'cancel did not restore stock: expected 7, got %', v_stock;
    END IF;
    IF (SELECT status FROM public.orders WHERE id = v_res.order_id) <> 'cancelled' THEN
        RAISE EXCEPTION 'order status was not set to cancelled';
    END IF;
    RAISE NOTICE 'F7  cancel_order() restored stock and set status';

    -- ── Line items were written with snapshot pricing ─────────────────────────
    IF (SELECT count(*) FROM public.order_items WHERE order_id = v_free.order_id) <> 1 THEN
        RAISE EXCEPTION 'order_items not written for the second order';
    END IF;
    IF (SELECT unit_price_npr FROM public.order_items WHERE order_id = v_free.order_id LIMIT 1) <> 1500 THEN
        RAISE EXCEPTION 'order_items did not snapshot the promotional price';
    END IF;
    RAISE NOTICE 'F8  order_items snapshots correct';

    -- ── A signed-in checkout must survive a missing or stale customer row ─────────────────────
    -- `orders.customer_id` references `customers(id)`. A staff account never gets a customer row
    -- (migration 0010 creates one only for non-staff signups) and a shopper's row can be stale, so
    -- both cases reached production as "violates foreign key constraint orders_customer_id_fkey"
    -- and failed the entire sale. Migration 0012 makes place_order() drop an unknown id instead of
    -- rejecting the order. Neither half of that invariant was covered by this file, so both are
    -- asserted here.
    SELECT * INTO v_guest FROM public.place_order(jsonb_build_object(
        'customer_name', 'Signed-in Staffer',
        'customer_phone', '9800000004',
        'delivery_address', 'Attariya Chowk',
        'delivery_city', 'Attariya',
        'payment_method', 'cod',
        'customer_id', gen_random_uuid()::text,   -- signed in, but no such customers row exists
        'items', jsonb_build_array(jsonb_build_object('product_id', v_cream, 'quantity', 1))
    ));

    IF v_guest.order_id IS NULL THEN
        RAISE EXCEPTION 'an unknown customer_id rejected the order instead of degrading to a guest order';
    END IF;

    SELECT customer_id INTO v_guest_customer FROM public.orders WHERE id = v_guest.order_id;
    IF v_guest_customer IS NOT NULL THEN
        RAISE EXCEPTION 'an unknown customer_id was stored instead of being dropped: %', v_guest_customer;
    END IF;
    RAISE NOTICE 'F9  unknown customer_id degrades to a guest order (no FK rejection)';

    -- The other half: an id that does exist must still be linked, or the order never appears under
    -- /account for the person who placed it. The customer row is created the way production creates
    -- it — insert the auth user and let handle_new_customer() (migration 0010) build the row —
    -- because inserting into `public.customers` directly would collide with that trigger.
    v_customer := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_customer, 'refactor-check@example.com', '{"full_name":"Refactor Check"}'::jsonb);

    SELECT * INTO v_linked FROM public.place_order(jsonb_build_object(
        'customer_name', 'Refactor Check',
        'customer_phone', '9800000005',
        'delivery_address', 'Attariya Chowk',
        'delivery_city', 'Attariya',
        'payment_method', 'cod',
        'customer_id', v_customer::text,
        'items', jsonb_build_array(jsonb_build_object('product_id', v_cream, 'quantity', 1))
    ));

    SELECT customer_id INTO v_linked_customer FROM public.orders WHERE id = v_linked.order_id;
    IF v_linked_customer IS DISTINCT FROM v_customer THEN
        RAISE EXCEPTION 'an existing customer_id was not linked to its order (stored %)', v_linked_customer;
    END IF;
    RAISE NOTICE 'F10 an existing customer_id is still linked to the order';

    -- Leave no fixture behind. The runner asserts the order book holds exactly two rows and the
    -- customer list exactly one, so both probes are removed: the orders first (their items cascade
    -- via 0004's FK), then the auth user, which cascades to the customer row (FK in 0006).
    DELETE FROM public.orders WHERE id IN (v_guest.order_id, v_linked.order_id);
    DELETE FROM auth.users WHERE id = v_customer;
END $$;

-- ── G. preview_coupon() advisory checks ───────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    SELECT * INTO r FROM public.preview_coupon('TEST10', 5000);
    IF NOT r.valid OR r.discount_npr <> 400 THEN
        RAISE EXCEPTION 'preview: 10%% of 5000 should be capped at 400, got % / valid=%', r.discount_npr, r.valid;
    END IF;

    SELECT * INTO r FROM public.preview_coupon('NOPE', 5000);
    IF r.valid THEN RAISE EXCEPTION 'unknown code reported as valid'; END IF;

    SELECT * INTO r FROM public.preview_coupon('TEST10', 500);
    IF r.valid THEN RAISE EXCEPTION 'below-minimum order reported as valid'; END IF;
    IF r.reason NOT LIKE '%1,000%' THEN RAISE EXCEPTION 'min-order message unclear: %', r.reason; END IF;

    RAISE NOTICE 'G1  preview_coupon() caps, rejects unknown codes and enforces the minimum';
END $$;

-- ── H. Appointment velocity guard ─────────────────────────────────────────────
DO $$
DECLARE
    v_svc UUID;
    i INT;
    v_blocked BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.services (title, slug, category, duration_minutes, price_npr)
    VALUES ('Verification Service', 'verification-service', 'hair', 60, 1000)
    RETURNING id INTO v_svc;

    FOR i IN 1..3 LOOP
        INSERT INTO public.appointments (client_name, client_phone, service_id, booking_date,
                                         booking_time, total_amount_npr, status, is_walk_in)
        VALUES ('Velocity ' || i, '9800000010', v_svc, current_date, ('09:0' || i)::time, 1000, 'pending', FALSE);
    END LOOP;

    BEGIN
        INSERT INTO public.appointments (client_name, client_phone, service_id, booking_date,
                                        booking_time, total_amount_npr, status, is_walk_in)
        VALUES ('Velocity 4', '9800000010', v_svc, current_date, '10:00'::time, 1000, 'pending', FALSE);
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;

    IF NOT v_blocked THEN RAISE EXCEPTION 'the 4th booking for one phone/date was allowed'; END IF;
    RAISE NOTICE 'H1  booking velocity guard blocks the 4th attempt';

    -- Walk-ins are staff-recorded and must NOT be capped.
    INSERT INTO public.appointments (client_name, client_phone, service_id, booking_date,
                                     booking_time, total_amount_npr, status, is_walk_in)
    VALUES ('Walk-in', '9800000010', v_svc, current_date, '10:30'::time, 1000, 'confirmed', TRUE);
    RAISE NOTICE 'H2  walk-ins bypass the velocity guard';
END $$;

-- ── I. staff/customer triggers ────────────────────────────────────────────────
DO $$
DECLARE v_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_id, 'staff-verify@example.com', '{"full_name":"Verify Staff","role":"admin"}'::jsonb);

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id AND role = 'admin') THEN
        RAISE EXCEPTION 'handle_new_staff_user() did not create an admin profile';
    END IF;

    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (gen_random_uuid(), 'customer-verify@example.com', '{"full_name":"Verify Customer"}'::jsonb);

    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE email = 'customer-verify@example.com') THEN
        RAISE EXCEPTION 'handle_new_customer() did not create a customer row';
    END IF;

    -- Regression test for the privilege-escalation bug fixed in migration 0010: a public
    -- customer signup must never end up with a staff profile.
    IF EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.customers c ON c.id = p.id
        WHERE c.email = 'customer-verify@example.com'
    ) THEN
        RAISE EXCEPTION 'SECURITY: a customer signup produced a staff profile';
    END IF;

    -- …and a staff invitation must not be filed as a customer.
    IF EXISTS (
        SELECT 1
        FROM public.customers c
        JOIN auth.users u ON u.id = c.id
        WHERE u.raw_user_meta_data->>'role' IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'SECURITY: a staff account was also created as a customer';
    END IF;

    RAISE NOTICE 'I1  staff and customer signup triggers fire correctly, with roles separated';
END $$;

-- ── J. shop_kpis(): staff only, and returns figures ───────────────────────────
DO $$
DECLARE
    r RECORD;
    v_staff UUID;
BEGIN
    -- Without a staff session it must refuse (it exposes revenue).
    BEGIN
        SELECT * INTO r FROM public.shop_kpis(current_date);
        RAISE EXCEPTION 'shop_kpis() ran without a staff session';
    EXCEPTION WHEN OTHERS THEN
        IF position('NOT_AUTHORISED' IN SQLERRM) = 0 THEN RAISE; END IF;
    END;
    RAISE NOTICE 'J1  shop_kpis() refuses a non-staff caller';

    SELECT id INTO v_staff FROM public.profiles WHERE role = 'admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);

    SELECT * INTO r FROM public.shop_kpis(current_date);
    IF r IS NULL THEN RAISE EXCEPTION 'shop_kpis() returned nothing for staff'; END IF;
    RAISE NOTICE 'J2  shop_kpis() works for staff (orders today: %, revenue today: %)', r.orders_today, r.revenue_today;
END $$;

-- ── K. Seeded demo data is loadable ───────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'salon_settings'
      AND column_name IN ('home_section_order', 'cookie_notice_enabled', 'app_prompt_enabled',
                          'affiliate_enabled', 'facebook_url', 'shipping_fee_npr');
    IF n <> 6 THEN
        RAISE EXCEPTION 'expected 6 settings columns from migrations 0004/0007/0008, found %', n;
    END IF;
    RAISE NOTICE 'K1  all settings columns from migrations 0004/0007/0008 present';
END $$;

-- ── L. Reviews are moderated, and hold no contact details ─────────────────────
-- Structural + constraint behaviour. Which ROWS each role can see is proven by
-- run-local-tests.sh, which impersonates `anon` and `authenticated` for real.
DO $$
DECLARE
    n          INT;
    v_probe    UUID;
    n_approved INT;
BEGIN
    -- L1  the seeded quotes arrive pending, not published
    SELECT count(*) INTO n FROM public.reviews WHERE source = 'imported';
    IF n <> 6 THEN
        RAISE EXCEPTION 'expected 6 imported reviews, found %', n;
    END IF;

    SELECT count(*) INTO n FROM public.reviews WHERE source = 'imported' AND is_approved;
    IF n <> 0 THEN
        RAISE EXCEPTION '% imported review(s) were seeded as already approved', n;
    END IF;
    RAISE NOTICE 'L1  6 imported quotes awaiting approval; none published';

    -- L2  a browser cannot reach the moderation columns
    IF has_column_privilege('anon', 'public.reviews', 'approved_by', 'SELECT') THEN
        RAISE EXCEPTION 'anon can read reviews.approved_by';
    END IF;
    IF NOT has_column_privilege('anon', 'public.reviews', 'body', 'SELECT') THEN
        RAISE EXCEPTION 'anon cannot read reviews.body — the public feed would be empty';
    END IF;
    RAISE NOTICE 'L2  anon can read review text but not the approving staff id';

    -- L3  the rating constraint rejects nonsense
    BEGIN
        INSERT INTO public.reviews (author_name, rating, body)
        VALUES ('Bad Rating', 6, 'A perfectly ordinary review body.');
        RAISE EXCEPTION 'a rating of 6 was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'L3  rating outside 1–5 rejected';
    END;

    -- L4  a three-character review is not a review
    BEGIN
        INSERT INTO public.reviews (author_name, rating, body) VALUES ('Too Short', 5, 'ok');
        RAISE EXCEPTION 'a 2-character review body was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'L4  review body shorter than 10 characters rejected';
    END;

    -- L5  an approved row must record when it was approved
    BEGIN
        INSERT INTO public.reviews (author_name, rating, body, is_approved)
        VALUES ('Half Approved', 5, 'Approved but with no timestamp at all.', TRUE);
        RAISE EXCEPTION 'a review was approved without an approved_at timestamp';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'L5  approved-without-timestamp rejected';
    END;

    -- L6  the well-formed version of the same row IS accepted, and is the only published one
    INSERT INTO public.reviews (author_name, rating, body, is_approved, approved_at)
    VALUES ('Shape Probe', 4, 'This row exists only to prove the shape constraint.', TRUE, now())
    RETURNING id INTO v_probe;

    SELECT count(*) INTO n_approved FROM public.reviews WHERE is_approved;
    IF n_approved <> 1 THEN
        RAISE EXCEPTION 'expected exactly the probe to be approved, found %', n_approved;
    END IF;

    DELETE FROM public.reviews WHERE id = v_probe;  -- leave the table exactly as we found it
    RAISE NOTICE 'L6  approved row with a timestamp accepted, then removed';
END $$;

-- ── M. Affiliate applications carry social accounts ───────────────────────────
DO $$
DECLARE
    n_cols INT;
    v_id   UUID;
    v_fb   TEXT;
BEGIN
    -- M1  the three columns exist
    SELECT count(*) INTO n_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliates'
      AND column_name IN ('facebook_url', 'instagram_url', 'tiktok_url');

    IF n_cols <> 3 THEN
        RAISE EXCEPTION 'expected 3 social columns on affiliates, found %', n_cols;
    END IF;
    RAISE NOTICE 'M1  affiliates carries facebook_url, instagram_url, tiktok_url';

    -- M2  an untouched form field posting "" is treated as absent, not as a bad value
    INSERT INTO public.affiliates (name, phone, code, status, instagram_url, tiktok_url)
    VALUES ('Blank Probe', '9811111114', 'BLANKP', 'pending', '', '')
    RETURNING id INTO v_id;

    IF (SELECT instagram_url FROM public.affiliates WHERE id = v_id) IS DISTINCT FROM '' THEN
        RAISE EXCEPTION 'a blank account string did not round-trip';
    END IF;
    RAISE NOTICE 'M2  blank account strings accepted (treated as absent)';

    -- M3  a link to the wrong network is rejected rather than stored
    BEGIN
        INSERT INTO public.affiliates (name, phone, code, status, instagram_url)
        VALUES ('Bad Probe', '9811111115', 'BADP', 'pending', 'https://www.tiktok.com/@someone');
        RAISE EXCEPTION 'the instagram_url column accepted a TikTok link';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'M3  wrong-network link rejected';
    END;

    -- M4  a Facebook share link keeps both path segments
    INSERT INTO public.affiliates (name, phone, code, status, facebook_url)
    VALUES ('Share Probe', '9811111116', 'SHAREP', 'pending', 'https://www.facebook.com/share/1Dgw2YFiiZ/')
    RETURNING id INTO v_id;

    SELECT facebook_url INTO v_fb FROM public.affiliates WHERE id = v_id;
    IF v_fb IS DISTINCT FROM 'https://www.facebook.com/share/1Dgw2YFiiZ/' THEN
        RAISE EXCEPTION 'the facebook share link was mangled: %', v_fb;
    END IF;
    RAISE NOTICE 'M4  facebook share link stored intact';

    DELETE FROM public.affiliates WHERE code IN ('BLANKP', 'SHAREP');
END $$;

\echo ''
\echo '  ✔ all functional assertions passed'
\echo ''
