-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0009: security hardening for the privileged RPCs
--
-- WHY THIS EXISTS
-- ---------------
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default. That means the
-- earlier statements in 0004/0008:
--
--     REVOKE EXECUTE ON FUNCTION public.place_order(JSONB) FROM anon, authenticated;
--
-- did nothing useful: `anon` and `authenticated` still inherit EXECUTE through PUBLIC, so the
-- functions remained callable straight from the browser via PostgREST, e.g.
--
--     POST /rest/v1/rpc/place_order     (with the public anon key)
--     POST /rest/v1/rpc/preview_coupon  (coupon-code enumeration)
--     POST /rest/v1/rpc/cancel_order    (cancel any order and restore its stock)
--     POST /rest/v1/rpc/shop_kpis       (read the shop's revenue figures)
--
-- This migration revokes from PUBLIC and re-grants narrowly, then adds an internal staff check
-- to the two functions that staff call from the browser. Defence in depth: even if a grant is
-- widened by mistake later, SECURITY DEFINER functions still refuse a non-staff caller.
--
-- Verified by `supabase/local/run-local-tests.sh`, which asserts the exact privilege matrix.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Close the PUBLIC grants ────────────────────────────────────────────────
-- Server-only RPCs: executed by the service-role key from the Next.js route handlers.
REVOKE EXECUTE ON FUNCTION public.place_order(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_coupon(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_coupon(TEXT, NUMERIC) TO service_role;

-- Staff-facing RPCs, called from the admin console in the browser (a signed-in staff JWT).
REVOKE EXECUTE ON FUNCTION public.cancel_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shop_kpis(DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.attach_order_to_customer(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shop_kpis(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_order_to_customer(TEXT, TEXT) TO authenticated, service_role;

-- ── 2. cancel_order(): staff only ─────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS, so a customer holding a valid session could otherwise cancel
-- somebody else's order and silently put its stock back on the shelf.
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.order_status;
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'NOT_AUTHORISED_STAFF_ONLY';
    END IF;

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

-- ── 3. shop_kpis(): staff only ────────────────────────────────────────────────
-- Returns revenue, so it must not be readable by a customer who happens to hold a session.
CREATE OR REPLACE FUNCTION public.shop_kpis(
    p_date DATE DEFAULT (timezone('Asia/Kathmandu', now()))::date
)
RETURNS TABLE (
    orders_today     BIGINT,
    revenue_today    NUMERIC,
    orders_pending   BIGINT,
    orders_shipped   BIGINT,
    low_stock_count  BIGINT,
    units_sold_month BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'NOT_AUTHORISED_STAFF_ONLY';
    END IF;

    RETURN QUERY
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
END;
$$;

-- NOTE: because this file re-created the two functions above, PostgreSQL reset their grants to
-- the default (EXECUTE to PUBLIC). The revokes must therefore be repeated after the bodies.
REVOKE EXECUTE ON FUNCTION public.cancel_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shop_kpis(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shop_kpis(DATE) TO authenticated, service_role;

-- ── 4. Report the resulting privilege matrix ─────────────────────────────────
DO $$
DECLARE
    r RECORD;
    exposed TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOR r IN
        SELECT p.proname,
               has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS user_can
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('place_order', 'preview_coupon', 'cancel_order', 'shop_kpis')
    LOOP
        RAISE NOTICE 'RPC % — anon: %, authenticated: %', r.proname, r.anon_can, r.user_can;
        IF r.anon_can THEN
            exposed := exposed || r.proname;
        END IF;
    END LOOP;

    IF array_length(exposed, 1) > 0 THEN
        RAISE EXCEPTION 'these RPCs are still callable with the public anon key: %', exposed;
    END IF;
END $$;
