-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0008: coupons, affiliate programme, order discounts
--                              and owner-controlled site settings
--
-- Authority model (unchanged from 0004): the client may *suggest* a coupon or referral code,
-- but `place_order()` re-reads the coupon, re-validates it and recomputes every figure. A
-- tampered checkout cannot invent a discount.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. COUPONS -----------------------------------------------------------------
-- Codes are stored uppercase. There is deliberately NO public SELECT policy: customers may
-- only learn whether a code they typed is valid, via the server-side preview endpoint.

CREATE TABLE public.coupons (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(32) UNIQUE NOT NULL,
    description        TEXT,
    discount_type      TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value     NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_npr      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_npr >= 0),
    -- Caps a percentage discount so "20% off" can never exceed a sane amount.
    max_discount_npr   NUMERIC(10, 2) CHECK (max_discount_npr IS NULL OR max_discount_npr > 0),
    usage_limit        INT CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count         INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    per_customer_limit INT NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
    starts_at          TIMESTAMPTZ,
    ends_at            TIMESTAMPTZ,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT coupons_window_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX coupons_code_active_idx ON public.coupons (upper(code)) WHERE is_active;

CREATE TRIGGER coupons_touch_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. AFFILIATES --------------------------------------------------------------
-- Anyone may apply (INSERT) as long as they insert themselves as 'pending'. Only staff can
-- read the list, approve, change rates or record payouts.

CREATE TABLE public.affiliates (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(120) NOT NULL,
    email              VARCHAR(160),
    phone              VARCHAR(20) NOT NULL,
    code               VARCHAR(32) UNIQUE NOT NULL,
    commission_rate    NUMERIC(5, 2) NOT NULL DEFAULT 5 CHECK (commission_rate >= 0 AND commission_rate <= 50),
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    payout_notes       TEXT,
    total_earned_npr   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_earned_npr >= 0),
    total_paid_npr     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_paid_npr >= 0),
    notes              TEXT,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX affiliates_status_idx ON public.affiliates (status);
CREATE INDEX affiliates_code_idx ON public.affiliates (upper(code));

CREATE TRIGGER affiliates_touch_updated_at
    BEFORE UPDATE ON public.affiliates
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. ORDER FIELDS ------------------------------------------------------------

ALTER TABLE public.orders
    ADD COLUMN discount_npr   NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_npr >= 0),
    ADD COLUMN coupon_code    VARCHAR(32),
    ADD COLUMN affiliate_code VARCHAR(32),
    ADD COLUMN commission_npr NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (commission_npr >= 0);

COMMENT ON COLUMN public.orders.discount_npr IS
    'Coupon discount actually applied, recomputed server-side in place_order().';
COMMENT ON COLUMN public.orders.commission_npr IS
    'Affiliate commission earned on this order, computed from the subtotal.';

-- 4. OWNER-CONTROLLED SITE SETTINGS -----------------------------------------

ALTER TABLE public.salon_settings
    ADD COLUMN cookie_notice_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN cookie_notice_text     TEXT DEFAULT
        'We use cookies to keep your cart working and to understand which products people like. You can accept all, or keep only what the site needs to function.',
    ADD COLUMN app_prompt_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN app_prompt_text        TEXT DEFAULT
        'Install the Alikati Beauty Home app for faster checkout and order updates — straight from your home screen. No app store needed.',
    -- Order in which the landing-page sections appear. The owner reorders these in /admin/settings.
    ADD COLUMN home_section_order     JSONB NOT NULL DEFAULT
        '["products", "services", "academy", "portfolio", "reviews"]'::jsonb,
    ADD COLUMN affiliate_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN affiliate_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5
        CHECK (affiliate_commission_rate >= 0 AND affiliate_commission_rate <= 50),
    ADD COLUMN affiliate_terms        TEXT DEFAULT
        'Share your link. When someone orders through it, you earn a commission on the product subtotal. Commissions are paid out monthly by eSewa or bank transfer once they reach रू 1,000.';

COMMENT ON COLUMN public.salon_settings.home_section_order IS
    'Landing-page section keys in display order. Unknown keys are ignored; missing keys are appended.';

-- 5. PLACE_ORDER — coupon + affiliate aware ----------------------------------
-- Rewritten from 0004. Everything else is unchanged: prices are re-read, stock is reserved
-- under a row lock, and the caller cannot influence any figure except by choosing products.
--
-- This revision returns four extra columns (discount, coupon_applied, affiliate_applied), and
-- PostgreSQL refuses to change a function's OUT-parameter row type through CREATE OR REPLACE:
--   ERROR: cannot change return type of existing function
--   HINT:  Use DROP FUNCTION place_order(jsonb) first.
-- The previous definition is therefore dropped explicitly. Nothing depends on it — the
-- application calls it through PostgREST by name — and the REVOKE below re-applies the
-- same lockdown to the new definition.
DROP FUNCTION IF EXISTS public.place_order(JSONB);

CREATE OR REPLACE FUNCTION public.place_order(payload JSONB)
RETURNS TABLE (
    order_id UUID,
    order_reference VARCHAR,
    subtotal NUMERIC,
    discount NUMERIC,
    shipping NUMERIC,
    total NUMERIC,
    coupon_applied VARCHAR,
    affiliate_applied VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item            JSONB;
    v_product         public.products;
    v_qty             INT;
    v_subtotal        NUMERIC(10, 2) := 0;
    v_discount        NUMERIC(10, 2) := 0;
    v_shipping        NUMERIC(10, 2) := 0;
    v_fee             NUMERIC(10, 2);
    v_threshold       NUMERIC(10, 2);
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
    v_shipping := CASE WHEN v_threshold > 0 AND v_subtotal >= v_threshold THEN 0 ELSE v_fee END;

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
        delivery_address, delivery_city, delivery_landmark, notes,
        status, payment_method, payment_status,
        subtotal_npr, discount_npr, shipping_npr, total_npr,
        coupon_code, affiliate_code, commission_npr
    ) VALUES (
        v_order_id, v_ref, v_customer_id,
        payload->>'customer_name', payload->>'customer_phone', payload->>'customer_email',
        payload->>'delivery_address', payload->>'delivery_city', payload->>'delivery_landmark',
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
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(JSONB) FROM anon, authenticated;

-- 6. COUPON PREVIEW ----------------------------------------------------------
-- Advisory only, for the checkout UI. Called by the server route with the service role; the
-- authoritative application happens inside place_order().

CREATE OR REPLACE FUNCTION public.preview_coupon(p_code TEXT, p_subtotal NUMERIC)
RETURNS TABLE (
    valid BOOLEAN,
    reason TEXT,
    code VARCHAR,
    discount_type TEXT,
    discount_value NUMERIC,
    discount_npr NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon public.coupons;
    v_code   VARCHAR(32) := upper(trim(COALESCE(p_code, '')));
    v_off    NUMERIC(10, 2);
BEGIN
    IF v_code = '' THEN
        RETURN QUERY SELECT FALSE, 'Enter a code.', NULL::VARCHAR, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    -- The table MUST be aliased here: `code` is also an OUT parameter of this function, and
    -- PL/pgSQL resolves an unqualified reference to the variable rather than the column,
    -- raising `column reference "code" is ambiguous` at runtime. This bug was caught by
    -- supabase/local/run-local-tests.sh — every coupon check failed with it.
    SELECT * INTO v_coupon FROM public.coupons AS c WHERE upper(c.code) = v_code;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'That code is not recognised.', NULL::VARCHAR, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    IF NOT v_coupon.is_active THEN
        RETURN QUERY SELECT FALSE, 'That offer has ended.', v_code, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
        RETURN QUERY SELECT FALSE, 'That offer has not started yet.', v_code, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    IF v_coupon.ends_at IS NOT NULL AND now() > v_coupon.ends_at THEN
        RETURN QUERY SELECT FALSE, 'That code expired.', v_code, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
        RETURN QUERY SELECT FALSE, 'That offer has been fully claimed.', v_code, NULL::TEXT, NULL::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    IF p_subtotal < v_coupon.min_order_npr THEN
        RETURN QUERY SELECT FALSE,
            'Spend at least रू ' || to_char(v_coupon.min_order_npr, 'FM999,999,990') || ' to use this code.',
            v_code, v_coupon.discount_type, v_coupon.discount_value, 0::NUMERIC;
        RETURN;
    END IF;

    IF v_coupon.discount_type = 'percent' THEN
        v_off := round(p_subtotal * v_coupon.discount_value / 100, 2);
    ELSE
        v_off := v_coupon.discount_value;
    END IF;
    IF v_coupon.max_discount_npr IS NOT NULL THEN
        v_off := LEAST(v_off, v_coupon.max_discount_npr);
    END IF;
    v_off := LEAST(GREATEST(v_off, 0), p_subtotal);

    RETURN QUERY SELECT TRUE, 'Code applied.', v_code, v_coupon.discount_type, v_coupon.discount_value, v_off;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_coupon(TEXT, NUMERIC) FROM anon, authenticated;

-- 7. RLS ---------------------------------------------------------------------

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

-- Coupons: staff manage them. No public policy at all — a customer can only test a code they
-- already hold, through the server-side preview endpoint.
CREATE POLICY coupons_read_staff ON public.coupons
    FOR SELECT USING (public.is_staff());
CREATE POLICY coupons_insert_admin ON public.coupons
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY coupons_update_admin ON public.coupons
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY coupons_delete_admin ON public.coupons
    FOR DELETE USING (public.is_admin());

-- Affiliates: anyone may apply, but only as a pending applicant with no earnings.
CREATE POLICY affiliates_apply_public ON public.affiliates
    FOR INSERT WITH CHECK (
        status = 'pending'
        AND total_earned_npr = 0
        AND total_paid_npr = 0
    );
CREATE POLICY affiliates_read_staff ON public.affiliates
    FOR SELECT USING (public.is_staff());
CREATE POLICY affiliates_update_staff ON public.affiliates
    FOR UPDATE USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY affiliates_delete_admin ON public.affiliates
    FOR DELETE USING (public.is_admin());

-- 8. VERIFY ------------------------------------------------------------------
SELECT 'coupons' AS object, count(*) FROM public.coupons
UNION ALL
SELECT 'affiliates', count(*) FROM public.affiliates;
