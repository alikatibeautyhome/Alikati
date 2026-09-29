-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0004: e-commerce (catalogue, orders, stock)
--
-- Adds the retail side of the business on top of the salon platform:
--   product_categories → products → orders → order_items
--
-- Design decisions worth knowing:
--   • Orders are NEVER inserted directly by clients. `place_order()` is a SECURITY
--     DEFINER function that re-reads every price, validates stock and decrements it
--     atomically. EXECUTE is revoked from anon/authenticated, so the only caller is the
--     server-side checkout route using the service-role key.
--   • `order_items` snapshots the product name and unit price at purchase time, so a later
--     price change never rewrites history.
--   • Stock is reserved when the order is placed and restored if it is cancelled.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. ENUMS -------------------------------------------------------------------
CREATE TYPE order_status   AS ENUM ('pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded');
CREATE TYPE payment_method AS ENUM ('cod', 'bank_transfer', 'esewa', 'khalti');

-- 2. PRODUCT CATEGORIES ------------------------------------------------------
CREATE TABLE public.product_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    slug          VARCHAR(120) UNIQUE NOT NULL,
    description   TEXT,
    image_url     TEXT,
    display_order INT DEFAULT 0,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. PRODUCTS ----------------------------------------------------------------
CREATE TABLE public.products (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(160) NOT NULL,
    slug               VARCHAR(180) UNIQUE NOT NULL,
    sku                VARCHAR(60) UNIQUE,
    category_id        UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    brand              VARCHAR(120),
    short_description  VARCHAR(240),
    description        TEXT,
    price_npr          NUMERIC(10, 2) NOT NULL CHECK (price_npr >= 0),
    discount_price_npr NUMERIC(10, 2) DEFAULT NULL CHECK (discount_price_npr IS NULL OR discount_price_npr >= 0),
    cost_price_npr     NUMERIC(10, 2) DEFAULT NULL CHECK (cost_price_npr IS NULL OR cost_price_npr >= 0),
    stock_qty          INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    image_url          TEXT,
    images             JSONB DEFAULT '[]'::jsonb NOT NULL,
    -- Display-only variant metadata (e.g. label "Shade", options ["Rosewood","Coral"]).
    -- v1 sells one SKU per product; per-variant stock is a later migration.
    variant_label      VARCHAR(60),
    variant_options    JSONB DEFAULT '[]'::jsonb NOT NULL,
    tags               JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_active          BOOLEAN DEFAULT TRUE,
    is_featured        BOOLEAN DEFAULT FALSE,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ORDERS ------------------------------------------------------------------
CREATE TABLE public.orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           VARCHAR(20) UNIQUE NOT NULL,
    customer_name       VARCHAR(120) NOT NULL,
    customer_phone      VARCHAR(20) NOT NULL,
    customer_email      VARCHAR(160),
    delivery_address    TEXT NOT NULL,
    delivery_city       VARCHAR(80) NOT NULL,
    delivery_landmark   VARCHAR(160),
    notes               TEXT,
    status              order_status DEFAULT 'pending' NOT NULL,
    payment_method      payment_method DEFAULT 'cod' NOT NULL,
    payment_status      payment_status DEFAULT 'unpaid' NOT NULL,
    subtotal_npr        NUMERIC(10, 2) NOT NULL CHECK (subtotal_npr >= 0),
    shipping_npr        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (shipping_npr >= 0),
    total_npr           NUMERIC(10, 2) NOT NULL CHECK (total_npr >= 0),
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ORDER ITEMS (price snapshot) --------------------------------------------
CREATE TABLE public.order_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id     UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name   VARCHAR(180) NOT NULL,
    product_slug   VARCHAR(180),
    image_url      TEXT,
    variant        VARCHAR(120),
    unit_price_npr NUMERIC(10, 2) NOT NULL CHECK (unit_price_npr >= 0),
    quantity       INT NOT NULL CHECK (quantity > 0),
    line_total_npr NUMERIC(10, 2) NOT NULL CHECK (line_total_npr >= 0),
    created_at     TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. INDEXES -----------------------------------------------------------------
CREATE INDEX idx_products_active_category ON public.products (is_active, category_id);
CREATE INDEX idx_products_featured        ON public.products (is_featured) WHERE is_active;
CREATE INDEX idx_products_stock           ON public.products (stock_qty) WHERE is_active;
CREATE INDEX idx_categories_active_order  ON public.product_categories (is_active, display_order);
CREATE INDEX idx_orders_status_created    ON public.orders (status, created_at DESC);
CREATE INDEX idx_orders_phone             ON public.orders (customer_phone);
CREATE INDEX idx_orders_reference         ON public.orders (reference);
CREATE INDEX idx_order_items_order        ON public.order_items (order_id);

-- 7. STORE SETTINGS (extends the singleton salon_settings row) ---------------
ALTER TABLE public.salon_settings
    ADD COLUMN store_enabled                BOOLEAN DEFAULT TRUE,
    ADD COLUMN shipping_fee_npr             NUMERIC(10, 2) DEFAULT 150 CHECK (shipping_fee_npr >= 0),
    ADD COLUMN free_shipping_threshold_npr  NUMERIC(10, 2) DEFAULT 5000 CHECK (free_shipping_threshold_npr >= 0),
    ADD COLUMN cod_enabled                  BOOLEAN DEFAULT TRUE,
    ADD COLUMN bank_transfer_enabled        BOOLEAN DEFAULT TRUE,
    ADD COLUMN payment_instructions         TEXT DEFAULT 'eSewa: 98XXXXXXXX (Alikati Beauty Home). Send a screenshot of the payment to confirm your order.',
    ADD COLUMN support_email                VARCHAR(160),
    ADD COLUMN delivery_note                TEXT DEFAULT 'Inside Attariya: same-day. Elsewhere in Kailali: 1–2 days.';

-- 8. updated_at TRIGGERS FOR THE NEW TABLES ----------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['product_categories', 'products', 'orders']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$s
             FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();', t);
    END LOOP;
END $$;

-- 9. PRICE HELPER (mirrors `effectivePrice` in TS) ---------------------------
-- Defined before place_order() so the order path never depends on declaration order.
CREATE OR REPLACE FUNCTION public.effective_price(base NUMERIC, discounted NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN discounted IS NOT NULL AND discounted < base THEN discounted ELSE base END;
$$;

-- 10. place_order() — atomic, price-authoritative order creation -------------
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
    v_settings   public.salon_settings;
    v_item       JSONB;
    v_product    public.products;
    v_qty        INT;
    v_variant    VARCHAR(120);
    v_subtotal   NUMERIC(10, 2) := 0;
    v_shipping   NUMERIC(10, 2) := 0;
    v_fee        NUMERIC(10, 2);
    v_threshold  NUMERIC(10, 2);
    v_order_id   UUID := gen_random_uuid();
    v_reference  VARCHAR(20);
    v_lines      JSONB := '[]'::jsonb;
    v_line_count INT;
BEGIN
    v_line_count := jsonb_array_length(COALESCE(payload->'items', '[]'::jsonb));

    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'EMPTY_CART';
    END IF;
    IF v_line_count > 25 THEN
        RAISE EXCEPTION 'TOO_MANY_LINES';
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

-- 11. cancel_order() — restores reserved stock -------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_current public.order_status;
BEGIN
    SELECT status INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_current = 'cancelled' THEN
        RETURN;                                 -- already cancelled; nothing to restore
    END IF;
    IF v_current = 'delivered' THEN
        RAISE EXCEPTION 'CANNOT_CANCEL_DELIVERED';
    END IF;

    UPDATE public.products p
    SET stock_qty = p.stock_qty + oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.product_id = p.id;

    UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;
END;
$$;

-- 12. REPORTING VIEW --------------------------------------------------------
CREATE OR REPLACE VIEW public.v_product_sales AS
SELECT p.id                AS product_id,
       p.name,
       p.stock_qty,
       p.low_stock_threshold,
       COALESCE(SUM(oi.quantity), 0)                        AS units_sold,
       COALESCE(SUM(oi.line_total_npr), 0)                  AS revenue_npr
FROM public.products p
LEFT JOIN public.order_items oi ON oi.product_id = p.id
LEFT JOIN public.orders o      ON o.id = oi.order_id AND o.status <> 'cancelled'
GROUP BY p.id, p.name, p.stock_qty, p.low_stock_threshold;

-- 13. BUSINESS SUMMARY ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_kpis(p_date DATE DEFAULT (timezone('Asia/Kathmandu', now()))::date)
RETURNS TABLE (
    orders_today     BIGINT,
    revenue_today    NUMERIC,
    orders_pending   BIGINT,
    orders_shipped   BIGINT,
    low_stock_count  BIGINT,
    units_sold_month BIGINT
)
LANGUAGE sql STABLE AS $$
    SELECT
        (SELECT count(*) FROM public.orders WHERE created_at::date = p_date AND status <> 'cancelled'),
        (SELECT COALESCE(SUM(total_npr), 0) FROM public.orders WHERE created_at::date = p_date AND status <> 'cancelled'),
        (SELECT count(*) FROM public.orders WHERE status = 'pending'),
        (SELECT count(*) FROM public.orders WHERE status IN ('packed', 'shipped')),
        (SELECT count(*) FROM public.products WHERE is_active AND stock_qty <= low_stock_threshold),
        (SELECT COALESCE(SUM(oi.quantity), 0)
           FROM public.order_items oi
           JOIN public.orders o ON o.id = oi.order_id
          WHERE o.status <> 'cancelled'
            AND o.created_at >= date_trunc('month', timezone('Asia/Kathmandu', now())));
$$;
