-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0006: customer accounts (signup, login, order history)
--
-- Adds an OPTIONAL shopper identity on top of the guest-first storefront:
--   • Anyone can browse, add to cart and check out without an account.
--   • A signed-in customer gets their orders grouped under their account and a saved profile.
--
-- Design decisions worth knowing:
--   • `customers` is a separate table from the staff `profiles` table. Customers and staff are
--     different identities with different privileges; they must never be mixed.
--   • Orders keep a nullable `customer_id`. Guest orders stay NULL and are unaffected.
--   • `place_order()` still owns pricing and stock. It now accepts an optional `customer_id`
--     and degrades to a guest order when the id is missing, malformed or unknown.
--   • Customers may only read their own row and their own orders. No existing policy is
--     weakened — every rule here is additive.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. CUSTOMERS ----------------------------------------------------------------
CREATE TABLE public.customers (
    id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email            TEXT UNIQUE NOT NULL,
    full_name        TEXT NOT NULL,
    phone            VARCHAR(20),
    default_address  TEXT,
    default_city     VARCHAR(80),
    marketing_opt_in BOOLEAN DEFAULT FALSE NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_customers_email ON public.customers (lower(email));
CREATE INDEX idx_customers_phone ON public.customers (phone);

-- 2. ORDER → CUSTOMER LINK ----------------------------------------------------
-- Nullable: guest orders keep customer_id = NULL. Deleting a customer keeps their orders.
ALTER TABLE public.orders
    ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_customer ON public.orders (customer_id);

-- 3. updated_at AUTO-TOUCH ----------------------------------------------------
CREATE TRIGGER trg_customers_touch
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. AUTO-PROVISION THE CUSTOMER ROW ON SIGN-UP -------------------------------
-- Mirrors `handle_new_staff_user()` (which provisions `profiles`). Both triggers stay in
-- place because they write to different tables.
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Customer accounts are email-based; ignore anything else (e.g. phone-only users).
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.customers (id, email, full_name, phone, marketing_opt_in)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Customer'),
        NULLIF(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, FALSE)
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_customer_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_customer();

-- 5. place_order() — now accepts an optional customer_id ----------------------
-- Identical behaviour to 0004 (authoritative pricing, stock reservation, shipping threshold),
-- plus a nullable `customer_id`. An unknown or malformed id silently degrades to a guest order
-- rather than failing the checkout.
CREATE OR REPLACE FUNCTION public.place_order(payload JSONB)
RETURNS TABLE (
    order_id        UUID,
    order_reference VARCHAR,
    subtotal_npr    NUMERIC,
    shipping_npr    NUMERIC,
    total_npr       NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_settings    public.salon_settings;
    v_item        JSONB;
    v_product     public.products;
    v_qty         INT;
    v_variant     VARCHAR(120);
    v_subtotal    NUMERIC(10, 2) := 0;
    v_shipping    NUMERIC(10, 2) := 0;
    v_fee         NUMERIC(10, 2);
    v_threshold   NUMERIC(10, 2);
    v_customer_id UUID;
    v_order_id    UUID := gen_random_uuid();
    v_reference   VARCHAR(20);
    v_lines       JSONB := '[]'::jsonb;
    v_line_count  INT;
BEGIN
    v_line_count := jsonb_array_length(COALESCE(payload->'items', '[]'::jsonb));

    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'EMPTY_CART';
    END IF;
    IF v_line_count > 25 THEN
        RAISE EXCEPTION 'TOO_MANY_LINES';
    END IF;

    -- Optional account link: never trust the shape, and never fail the order over it.
    BEGIN
        v_customer_id := NULLIF(payload->>'customer_id', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        v_customer_id := NULL;
    END;
    IF v_customer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id) THEN
        v_customer_id := NULL;
    END IF;

    SELECT * INTO v_settings FROM public.salon_settings WHERE id = 1;
    v_fee       := COALESCE(v_settings.shipping_fee_npr, 0);
    v_threshold := COALESCE(v_settings.free_shipping_threshold_npr, 0);
    v_reference := 'ABH-ORD-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));

    -- Pass 1: lock each product, validate, snapshot the authoritative price.
    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items')
    LOOP
        v_qty := GREATEST(1, LEAST(20, COALESCE((v_item->>'quantity')::INT, 1)));
        v_variant := NULLIF(v_item->>'variant', '');

        SELECT * INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
        END IF;
        IF v_product.is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_product.name;
        END IF;
        IF v_product.stock_qty < v_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product.name;
        END IF;

        v_subtotal := v_subtotal + (public.effective_price(v_product.price_npr, v_product.discount_price_npr) * v_qty);

        v_lines := v_lines || jsonb_build_object(
            'product_id',   v_product.id,
            'product_name', v_product.name,
            'product_slug', v_product.slug,
            'image_url',    v_product.image_url,
            'variant',      v_variant,
            'unit_price',   public.effective_price(v_product.price_npr, v_product.discount_price_npr),
            'quantity',     v_qty
        );
    END LOOP;

    -- Free delivery above the configured threshold; a 0 threshold means always free.
    IF v_threshold > 0 AND v_subtotal < v_threshold THEN
        v_shipping := v_fee;
    END IF;

    INSERT INTO public.orders (
        id, reference, customer_name, customer_phone, customer_email,
        delivery_address, delivery_city, delivery_landmark, notes,
        customer_id,
        status, payment_method, payment_status,
        subtotal_npr, shipping_npr, total_npr
    ) VALUES (
        v_order_id,
        v_reference,
        payload->>'customer_name',
        payload->>'customer_phone',
        NULLIF(payload->>'customer_email', ''),
        payload->>'delivery_address',
        payload->>'delivery_city',
        NULLIF(payload->>'delivery_landmark', ''),
        NULLIF(payload->>'notes', ''),
        v_customer_id,
        'pending',
        COALESCE(NULLIF(payload->>'payment_method', '')::public.payment_method, 'cod'),
        'unpaid',
        v_subtotal, v_shipping, v_subtotal + v_shipping
    );

    -- Pass 2: write the line items and reserve stock.
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        INSERT INTO public.order_items (
            order_id, product_id, product_name, product_slug, image_url,
            variant, unit_price_npr, quantity, line_total_npr
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            v_item->>'product_name',
            v_item->>'product_slug',
            v_item->>'image_url',
            NULLIF(v_item->>'variant', ''),
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT,
            (v_item->>'unit_price')::NUMERIC * (v_item->>'quantity')::INT
        );

        UPDATE public.products
        SET stock_qty = stock_qty - (v_item->>'quantity')::INT
        WHERE id = (v_item->>'product_id')::UUID;
    END LOOP;

    RETURN QUERY SELECT v_order_id, v_reference, v_subtotal, v_shipping, v_subtotal + v_shipping;
END;
$$;

-- Only the trusted server (service-role) path may place orders.
REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC, anon, authenticated;

-- 6. attach_order_to_customer() — a customer claims a guest order ---------------
-- Used when someone checks out as a guest, then signs in. The customer may only claim an
-- order that (a) is still unassigned and (b) was placed with the mobile number on their
-- account. SECURITY DEFINER so the write does not need a blanket UPDATE policy on orders.
CREATE OR REPLACE FUNCTION public.attach_order_to_customer(p_reference TEXT, p_phone TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_phone    TEXT;
    v_order_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;

    SELECT right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
    INTO v_phone
    FROM public.customers
    WHERE id = v_uid;

    IF v_phone IS NULL OR length(v_phone) < 10 THEN
        RAISE EXCEPTION 'PHONE_REQUIRED';
    END IF;
    IF right(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 10) <> v_phone THEN
        RAISE EXCEPTION 'PHONE_MISMATCH';
    END IF;

    UPDATE public.orders
    SET customer_id = v_uid
    WHERE reference = upper(p_reference)
      AND customer_id IS NULL
      AND right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 10) = v_phone
    RETURNING id INTO v_order_id;

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_order_to_customer(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_order_to_customer(TEXT, TEXT) TO authenticated;

-- 7. ROW LEVEL SECURITY -------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- A customer sees and edits only their own row; admins can read every customer.
CREATE POLICY "customers_self_select" ON public.customers
    FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "customers_self_update" ON public.customers
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "customers_self_insert" ON public.customers
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "customers_admin_read" ON public.customers
    FOR SELECT TO authenticated USING (public.is_admin());

-- A signed-in customer may read only their own orders (guest orders have no customer_id).
CREATE POLICY "orders_customer_read" ON public.orders
    FOR SELECT TO authenticated USING (customer_id = auth.uid());

-- …and the line items of those orders, via the owning order.
CREATE POLICY "order_items_customer_read" ON public.order_items
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.id = public.order_items.order_id
              AND o.customer_id = auth.uid()
        )
    );
