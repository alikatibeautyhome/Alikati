-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0024
--   • an order now remembers which district, municipality and ward it goes to
--   • delivery costs what the journey costs: free in Attariya, flat in Kailali
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why the address had to become structured ─────────────────────────────
-- The checkout collected one free-text `delivery_address` plus a `delivery_city` from a fixed
-- list. That is enough to write a label but not enough to price a delivery, and not enough to
-- route one: "Ward 4, near the bank" tells a courier nothing on its own, and no rule can be
-- applied to prose.
--
-- District, municipality and ward are the three parts Nepali addresses are actually composed of,
-- so they are stored as their own columns rather than concatenated into the free-text field. The
-- free-text field stays and keeps the detail a courier needs ("opposite NIC Asia"), and the
-- composed line is still what every existing screen reads — nothing that already worked breaks.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS delivery_district     VARCHAR(60),
    ADD COLUMN IF NOT EXISTS delivery_municipality VARCHAR(80),
    ADD COLUMN IF NOT EXISTS delivery_ward         VARCHAR(20);

COMMENT ON COLUMN public.orders.delivery_district IS
    'District the order is delivered to. Decides the courier fee — see delivery_fee_for().';
COMMENT ON COLUMN public.orders.delivery_municipality IS
    'Municipality or rural municipality, e.g. Godawari.';
COMMENT ON COLUMN public.orders.delivery_ward IS
    'Ward number within the municipality, stored as text so "04" reads as written.';

-- ── §2. One rule, in one place ───────────────────────────────────────────────
-- Delivery pricing used to be flat: `shipping_fee_npr`, waived above a threshold. That cannot
-- express "free in our own town, flat rate across the district", so the rule moved here.
--
-- This function is the authority. `lib/commerce.ts::deliveryFeeFor()` mirrors it so the checkout
-- can show the customer the same number before the order exists. Two implementations of one rule
-- can drift, which is why the client copy carries a comment saying so and this one is the one the
-- order is actually charged at.
--
-- The literal 100 is deliberate rather than sloppy: the owners asked for a flat rate across
-- Kailali, and a rate that is a plain, reviewable line of SQL is easier to change than one hidden
-- behind a settings screen nobody opens. If it needs tuning more often than that, it belongs in
-- `salon_settings` beside `shipping_fee_npr`.
CREATE OR REPLACE FUNCTION public.delivery_fee_for(
    p_district  TEXT,
    p_city      TEXT,
    p_subtotal  NUMERIC,
    p_fee       NUMERIC,
    p_threshold NUMERIC
) RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $delivery$
    SELECT CASE
        -- Attariya is the shop's own town. We run these ourselves, so they are free.
        WHEN btrim(COALESCE(p_city, '')) = 'Attariya' THEN 0::NUMERIC
        -- The rest of Kailali is one flat courier run, whatever the basket is worth.
        WHEN btrim(COALESCE(p_district, '')) = 'Kailali' THEN 100::NUMERIC
        -- Anywhere else keeps the configured fee, still waived above the free-delivery threshold.
        WHEN COALESCE(p_threshold, 0) > 0 AND p_subtotal >= p_threshold THEN 0::NUMERIC
        ELSE COALESCE(p_fee, 0)
    END
$delivery$;

COMMENT ON FUNCTION public.delivery_fee_for(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) IS
    'Delivery fee for a destination: 0 in Attariya, 100 elsewhere in Kailali, otherwise the '
    'configured fee (waived above the free-delivery threshold). place_order() is the caller of '
    'record; lib/commerce.ts::deliveryFeeFor() mirrors it for display.';

-- Called from inside the SECURITY DEFINER place_order(), which runs as its owner, so no role
-- needs EXECUTE on it directly. Withheld rather than left to the default PUBLIC grant.
REVOKE ALL ON FUNCTION public.delivery_fee_for(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC)
    FROM PUBLIC, anon, authenticated;

-- ── §3. place_order(): the live definition, with the shipping line replaced ──
-- Copied verbatim from 20260928000012 and altered in exactly two places — the shipping block now
-- calls the function above, and the INSERT carries the three new address columns. Everything
-- else, including the stale-customer-id guard from 0012, is untouched.

CREATE OR REPLACE FUNCTION public.place_order(payload jsonb)
 RETURNS TABLE(order_id uuid, order_reference character varying, subtotal numeric, discount numeric, shipping numeric, total numeric, coupon_applied character varying, affiliate_applied character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_item            JSONB;
    v_product         public.products;
    v_qty             INT;
    v_subtotal        NUMERIC(10, 2) := 0;
    v_discount        NUMERIC(10, 2) := 0;
    v_shipping        NUMERIC(10, 2) := 0;
    v_fee             NUMERIC(10, 2);
    v_threshold       NUMERIC(10, 2);
    v_district        TEXT;
    v_city            TEXT;
    v_order_id        UUID := gen_random_uuid();
    v_ref             VARCHAR(20);
    v_settings        public.salon_settings;
    v_coupon          public.coupons;
    v_coupon_code     VARCHAR(32);
    v_affiliate       public.affiliates;
    v_affiliate_code  VARCHAR(32);
    v_commission      NUMERIC(10, 2) := 0;
    v_customer_id     UUID;
    v_line_count      INT := 0;
BEGIN
    IF payload->'items' IS NULL OR jsonb_array_length(payload->'items') = 0 THEN
        RAISE EXCEPTION 'EMPTY_CART';
    END IF;

    IF jsonb_array_length(payload->'items') > 25 THEN
        RAISE EXCEPTION 'TOO_MANY_LINES';
    END IF;

    SELECT * INTO v_settings FROM public.salon_settings WHERE id = 1;

    v_customer_id := NULLIF(payload->>'customer_id', '')::UUID;

    -- A stale or unknown customer id must never fail a sale. orders.customer_id references
    -- customers(id), and a signed-in STAFF account has no customer row (migration 0010 only
    -- creates one for non-staff signups) — so checkout 500'd for the shop owner's own account
    -- with "violates foreign key constraint orders_customer_id_fkey". Degrade to a guest order
    -- instead: the sale still completes, and the API links the account properly beforehand.
    IF v_customer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id) THEN
        v_customer_id := NULL;
    END IF;

    v_ref := 'ABH-ORD-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));

    ------------------------------------------------------------------ line items
    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
        v_qty := GREATEST(1, LEAST(COALESCE((v_item->>'quantity')::INT, 1), 20));
        v_line_count := v_line_count + 1;

        -- Row lock: prevents two simultaneous checkouts from overselling the same product.
        SELECT * INTO v_product FROM public.products
        WHERE id = (v_item->>'product_id')::UUID
        FOR UPDATE;

        IF NOT FOUND OR NOT v_product.is_active THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', COALESCE(v_item->>'product_id', 'unknown');
        END IF;

        IF v_product.stock_qty < v_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product.name;
        END IF;

        v_subtotal := v_subtotal + (public.effective_price(v_product.price_npr, v_product.discount_price_npr) * v_qty);
    END LOOP;

    --------------------------------------------------------------------- coupon
    v_coupon_code := upper(trim(COALESCE(payload->>'coupon_code', '')));

    IF v_coupon_code <> '' THEN
        SELECT * INTO v_coupon FROM public.coupons AS c WHERE upper(c.code) = v_coupon_code;

        IF FOUND THEN
            IF NOT v_coupon.is_active THEN
                RAISE EXCEPTION 'COUPON_INACTIVE';
            END IF;
            IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
                RAISE EXCEPTION 'COUPON_NOT_STARTED';
            END IF;
            IF v_coupon.ends_at IS NOT NULL AND now() > v_coupon.ends_at THEN
                RAISE EXCEPTION 'COUPON_EXPIRED';
            END IF;
            IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
                RAISE EXCEPTION 'COUPON_EXHAUSTED';
            END IF;
            IF v_subtotal < v_coupon.min_order_npr THEN
                RAISE EXCEPTION 'COUPON_MIN_ORDER:%', v_coupon.min_order_npr;
            END IF;
            IF v_coupon.per_customer_limit IS NOT NULL AND v_coupon.per_customer_limit > 0 THEN
                IF EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE upper(COALESCE(o.coupon_code, '')) = v_coupon_code
                      AND (
                            (v_customer_id IS NOT NULL AND o.customer_id = v_customer_id)
                         OR (v_customer_id IS NULL AND o.customer_phone = payload->>'customer_phone')
                      )
                ) THEN
                    RAISE EXCEPTION 'COUPON_ALREADY_USED';
                END IF;
            END IF;

            IF v_coupon.discount_type = 'percent' THEN
                v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
            ELSE
                v_discount := v_coupon.discount_value;
            END IF;

            IF v_coupon.max_discount_npr IS NOT NULL THEN
                v_discount := LEAST(v_discount, v_coupon.max_discount_npr);
            END IF;

            -- Never discount below zero, and never more than the goods are worth.
            v_discount := LEAST(GREATEST(v_discount, 0), v_subtotal);
        END IF;
        -- An unknown code is silently ignored rather than failing the whole order: the customer
        -- still gets their goods, and the response reports no coupon applied.
    END IF;

    ------------------------------------------------------------------ shipping
    v_fee := COALESCE(v_settings.shipping_fee_npr, 0);
    v_threshold := COALESCE(v_settings.free_shipping_threshold_npr, 0);
    v_district := COALESCE(payload->>'delivery_district', '');
    v_city := COALESCE(payload->>'delivery_city', '');

    -- Where it is going now decides what it costs, so the rule lives in one function that both
    -- this and the checkout's display path are held to.
    v_shipping := public.delivery_fee_for(v_district, v_city, v_subtotal, v_fee, v_threshold);

    ----------------------------------------------------------------- affiliate
    v_affiliate_code := upper(trim(COALESCE(payload->>'affiliate_code', '')));

    IF v_affiliate_code <> '' THEN
        SELECT * INTO v_affiliate FROM public.affiliates AS a WHERE upper(a.code) = v_affiliate_code;

        IF FOUND AND v_affiliate.status = 'active' THEN
            v_commission := round(v_subtotal * v_affiliate.commission_rate / 100, 2);
        ELSE
            -- Unknown or inactive referral: record nothing rather than the raw code.
            v_affiliate_code := NULL;
        END IF;
    ELSE
        v_affiliate_code := NULL;
    END IF;

    ---------------------------------------------------------------- order rows
    INSERT INTO public.orders (
        id, reference, customer_id, customer_name, customer_phone, customer_email,
        delivery_address, delivery_city, delivery_district, delivery_municipality,
        delivery_ward, delivery_landmark, notes,
        status, payment_method, payment_status,
        subtotal_npr, discount_npr, shipping_npr, total_npr,
        coupon_code, affiliate_code, commission_npr
    ) VALUES (
        v_order_id, v_ref, v_customer_id,
        payload->>'customer_name', payload->>'customer_phone', payload->>'customer_email',
        payload->>'delivery_address', payload->>'delivery_city',
        NULLIF(payload->>'delivery_district', ''), NULLIF(payload->>'delivery_municipality', ''),
        NULLIF(payload->>'delivery_ward', ''), payload->>'delivery_landmark',
        payload->>'notes',
        'pending',
        COALESCE((payload->>'payment_method')::public.payment_method, 'cod'),
        'unpaid',
        v_subtotal, v_discount, v_shipping,
        v_subtotal - v_discount + v_shipping,
        NULLIF(v_coupon_code, ''), v_affiliate_code, v_commission
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
        v_qty := GREATEST(1, LEAST(COALESCE((v_item->>'quantity')::INT, 1), 20));

        SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::UUID;

        INSERT INTO public.order_items (
            order_id, product_id, product_name, variant, unit_price_npr, quantity, line_total_npr
        ) VALUES (
            v_order_id, v_product.id, v_product.name, NULLIF(v_item->>'variant', ''),
            public.effective_price(v_product.price_npr, v_product.discount_price_npr), v_qty,
            public.effective_price(v_product.price_npr, v_product.discount_price_npr) * v_qty
        );

        UPDATE public.products
        SET stock_qty = stock_qty - v_qty
        WHERE id = v_product.id;
    END LOOP;

    IF NULLIF(v_coupon_code, '') IS NOT NULL AND v_discount > 0 THEN
        UPDATE public.coupons SET used_count = used_count + 1 WHERE upper(code) = v_coupon_code;
    END IF;

    IF v_affiliate_code IS NOT NULL AND v_commission > 0 THEN
        UPDATE public.affiliates
        SET total_earned_npr = total_earned_npr + v_commission
        WHERE upper(code) = v_affiliate_code;
    END IF;

    RETURN QUERY SELECT
        v_order_id, v_ref, v_subtotal, v_discount, v_shipping,
        v_subtotal - v_discount + v_shipping,
        NULLIF(v_coupon_code, '')::VARCHAR, v_affiliate_code::VARCHAR;
END;
$function$
