-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0005: RLS and storage for the e-commerce tables
--
-- Model:
--   • Categories and active products are world-readable (the storefront is public).
--   • Staff may create and update products (restocking, price changes) and move orders
--     through the fulfilment pipeline. Deleting product/category records is admin-only.
--   • Orders and order items have NO public policy of any kind. Orders are only ever
--     created by `place_order()`, whose EXECUTE grant belongs to the service role alone,
--     so a client cannot inject a price, skip the stock check, or read other people's orders.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;

-- ── product categories ──────────────────────────────────────────────────────
CREATE POLICY "categories_public_read" ON public.product_categories
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "categories_admin_insert" ON public.product_categories
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "categories_admin_update" ON public.product_categories
    FOR UPDATE USING (public.is_admin());
CREATE POLICY "categories_admin_delete" ON public.product_categories
    FOR DELETE USING (public.is_admin());

-- ── products ────────────────────────────────────────────────────────────────
-- Staff can restock and reprice; only admins may retire a product line.
CREATE POLICY "products_public_read" ON public.products
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "products_staff_insert" ON public.products
    FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "products_staff_update" ON public.products
    FOR UPDATE USING (public.is_staff());
CREATE POLICY "products_admin_delete" ON public.products
    FOR DELETE USING (public.is_admin());

-- ── orders ──────────────────────────────────────────────────────────────────
-- Intentionally no INSERT policy: orders arrive through place_order() only.
CREATE POLICY "orders_staff_read" ON public.orders
    FOR SELECT USING (public.is_staff());
CREATE POLICY "orders_staff_update" ON public.orders
    FOR UPDATE USING (public.is_staff());
CREATE POLICY "orders_admin_delete" ON public.orders
    FOR DELETE USING (public.is_admin());

-- ── order items ─────────────────────────────────────────────────────────────
CREATE POLICY "order_items_staff_read" ON public.order_items
    FOR SELECT USING (public.is_staff());

-- ── storage: product images ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('products', 'products', TRUE, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_media_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'products');

CREATE POLICY "product_media_staff_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'products' AND public.is_staff());

CREATE POLICY "product_media_staff_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'products' AND public.is_staff());

CREATE POLICY "product_media_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'products' AND public.is_admin());
