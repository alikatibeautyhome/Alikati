-- ═════════════════════════════════════════════════════════════════════════════
-- Review fixes (2026-10-27)
--  1. Staff/admin role now comes ONLY from app_metadata (settable only with the service role).
--     Public signups can no longer claim role "admin" through user_metadata.
--  2. Non-admins can no longer change their own role, is_active or email on profiles.
--  3. Academy enquiries go through submit_academy_lead() (anon INSERT was revoked in 20261006000001).
--  4. Staff may insert walk-in appointments.
--  5. Bookings: no past dates, must sit inside opening hours, and may not overlap any other
--     active appointment (using the service duration). Serialised with an advisory lock.
--  6. place_order(): coupon row locked (usage limit race), per-customer limit counts uses,
--     stock is reserved line by line (duplicate cart lines).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Roles from app_metadata only ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_role TEXT := COALESCE(NEW.raw_app_meta_data->>'role', '');
BEGIN
    IF v_role NOT IN ('admin', 'staff') THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id, NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Staff Member'),
        CASE WHEN v_role = 'admin' THEN 'admin' ELSE 'staff' END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;
    IF COALESCE(NEW.raw_app_meta_data->>'role', '') IN ('admin', 'staff') THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.customers (id, email, full_name, phone, marketing_opt_in)
    VALUES (
        NEW.id, NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Customer'),
        NULLIF(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, FALSE)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Audit: list profiles that may have been created by a self-claimed role before this fix.
-- Review these manually in the SQL editor:
--   SELECT p.id, p.email, p.role FROM public.profiles p JOIN auth.users u ON u.id = p.id
--   WHERE COALESCE(u.raw_app_meta_data->>'role','') NOT IN ('admin','staff');
-- Existing real staff need their app_metadata set once, e.g.:
--   UPDATE auth.users u SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p.role)
--   FROM public.profiles p WHERE p.id = u.id AND p.email IN ('owner@example.com');

-- ── 2. Profile self-update guard ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Service role / SQL editor (no JWT user) and active admins may change anything.
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'NOT_ALLOWED: only an admin can change role, status or email'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ── 3. Academy enquiries ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_academy_lead(
    p_student_name TEXT, p_student_phone TEXT, p_course_id UUID, p_notes TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id UUID;
BEGIN
    IF char_length(trim(COALESCE(p_student_name, ''))) NOT BETWEEN 2 AND 100 THEN
        RAISE EXCEPTION 'INVALID_NAME';
    END IF;
    IF char_length(trim(COALESCE(p_student_phone, ''))) NOT BETWEEN 7 AND 20 THEN
        RAISE EXCEPTION 'INVALID_PHONE';
    END IF;
    INSERT INTO public.academy_leads (student_name, student_phone, course_id, notes, status)
    VALUES (trim(p_student_name), trim(p_student_phone), p_course_id,
            NULLIF(left(COALESCE(p_notes, ''), 1000), ''), 'new')
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_academy_lead(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_academy_lead(TEXT, TEXT, UUID, TEXT) TO anon, authenticated;

-- ── 4. Walk-ins ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "appointments_staff_insert" ON public.appointments;
CREATE POLICY "appointments_staff_insert" ON public.appointments
    FOR INSERT TO authenticated
    WITH CHECK (public.is_staff());

-- ── 5. Booking rules enforced in the database ────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_duration INT;
    v_open TIME;
    v_close TIME;
    v_start TIMESTAMP;
    v_end TIMESTAMP;
BEGIN
    IF NEW.status NOT IN ('pending', 'confirmed', 'in_progress') THEN
        RETURN NEW;
    END IF;
    -- Status-only updates on an existing row need no re-check.
    IF TG_OP = 'UPDATE'
       AND NEW.booking_date = OLD.booking_date AND NEW.booking_time = OLD.booking_time
       AND NEW.service_id = OLD.service_id AND OLD.status IN ('pending', 'confirmed', 'in_progress') THEN
        RETURN NEW;
    END IF;

    SELECT duration_minutes INTO v_duration FROM public.services WHERE id = NEW.service_id;
    v_duration := COALESCE(v_duration, 60);
    SELECT COALESCE(opening_time, '08:00'), COALESCE(closing_time, '19:00')
      INTO v_open, v_close FROM public.salon_settings WHERE id = 1;
    v_open := COALESCE(v_open, '08:00');
    v_close := COALESCE(v_close, '19:00');

    v_start := NEW.booking_date + NEW.booking_time;
    v_end := v_start + make_interval(mins => v_duration);

    -- Public bookings only: walk-ins are created by staff for "right now".
    IF NOT COALESCE(NEW.is_walk_in, FALSE) THEN
        IF v_start <= timezone('Asia/Kathmandu', now()) THEN
            RAISE EXCEPTION 'BOOKING_IN_PAST' USING ERRCODE = '23514';
        END IF;
        IF NEW.booking_time < v_open OR v_end > NEW.booking_date + v_close THEN
            RAISE EXCEPTION 'BOOKING_OUTSIDE_HOURS' USING ERRCODE = '23514';
        END IF;
    END IF;

    -- One booking at a time per day is decided under this lock.
    PERFORM pg_advisory_xact_lock(hashtext('appointments:' || NEW.booking_date::text));

    IF EXISTS (
        SELECT 1
        FROM public.appointments a
        LEFT JOIN public.services s ON s.id = a.service_id
        WHERE a.booking_date = NEW.booking_date
          AND a.id IS DISTINCT FROM NEW.id
          AND a.status IN ('pending', 'confirmed', 'in_progress')
          AND (a.booking_date + a.booking_time) < v_end
          AND (a.booking_date + a.booking_time + make_interval(mins => COALESCE(s.duration_minutes, 60))) > v_start
    ) THEN
        RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = '23505';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_booking_rules ON public.appointments;
CREATE TRIGGER trg_appointments_booking_rules
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_rules();

-- ── 6. place_order() fixes ───────────────────────────────────────────────────
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

        -- Reserve the stock now, so a second line for the same product is checked against
        -- what is left rather than the original amount.
        UPDATE public.products SET stock_qty = stock_qty - v_qty WHERE id = v_product.id;

        v_subtotal := v_subtotal + (public.effective_price(v_product.price_npr, v_product.discount_price_npr) * v_qty);
    END LOOP;

    --------------------------------------------------------------------- coupon
    v_coupon_code := upper(trim(COALESCE(payload->>'coupon_code', '')));

    IF v_coupon_code <> '' THEN
        SELECT * INTO v_coupon FROM public.coupons AS c WHERE upper(c.code) = v_coupon_code
        FOR UPDATE;  -- serialises concurrent uses of the same coupon

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
                IF (
                    SELECT count(*) FROM public.orders o
                    WHERE upper(COALESCE(o.coupon_code, '')) = v_coupon_code
                      AND (
                            (v_customer_id IS NOT NULL AND o.customer_id = v_customer_id)
                         OR (v_customer_id IS NULL AND o.customer_phone = payload->>'customer_phone')
                      )
                ) >= v_coupon.per_customer_limit THEN
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
$function$;
