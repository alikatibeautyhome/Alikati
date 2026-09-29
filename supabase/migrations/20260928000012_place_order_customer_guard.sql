-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0012: a stale customer id must not fail a sale
--
-- THE BUG
--   The owner was signed in as an ADMIN account and clicked "Place order". The checkout sent
--   `customer_id`, but staff accounts have no row in `customers` (migration 0010 deliberately
--   creates one only for non-staff signups), so `orders.customer_id` violated its foreign key
--   and place_order() raised. The API turned that into a 500 and the customer saw the generic
--   "We could not place your order. Please call us on WhatsApp." Five such failures are in the
--   server log. Any signed-in staff account was unable to buy anything.
--
-- THE FIX (two layers)
--   1. `app/api/orders/route.ts` now creates the missing `customers` row for the verified
--      signed-in user before placing, so the order links to their account as intended.
--   2. This migration makes the function itself resilient: an id that does not exist is dropped
--      to NULL, turning a fatal error into a normal guest order.
--
-- The body below is the live definition with the guard inserted, so it cannot drift from what
-- is deployed.
-- ═════════════════════════════════════════════════════════════════════════════

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
$function$

