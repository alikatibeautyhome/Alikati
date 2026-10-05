-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0030
--   • one function that answers "are the migrations applied here?"
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why a function rather than probing from the app ──────────────────────
-- The first version of /api/health tested for each function by POSTing to `/rest/v1/rpc/<name>` with
-- an empty body and treating a 404 as "missing". That is wrong, and wrong in the worst direction: it
-- reported four functions as absent that were demonstrably present, because PostgREST answers 404
-- for a signature mismatch as well as for an unknown function. `place_order` called with no arguments
-- is not a function PostgREST can resolve, so it 404s exactly like one that does not exist.
--
-- A diagnostic that sends an operator chasing a problem that isn't there is worse than no diagnostic.
-- Asking the catalogue directly removes the guesswork: `pg_proc` and `information_schema` are
-- authoritative about what exists, and no argument-shape inference is involved.

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage, information_schema
AS $$
    SELECT jsonb_build_object(
        'missing_tables', (
            SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
            FROM unnest(ARRAY[
                'products', 'product_categories', 'orders', 'order_items', 'customers', 'profiles',
                'salon_settings', 'payment_accounts', 'security_events', 'rate_limit_counters',
                'services', 'appointments', 'academy_courses', 'academy_leads', 'reviews', 'coupons',
                'gallery_items', 'hero_slides', 'media_categories', 'media_assets', 'affiliates'
            ]) AS name
            WHERE NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = name
            )
        ),
        'missing_functions', (
            SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
            FROM unnest(ARRAY[
                'is_staff', 'is_admin', 'place_order', 'delivery_fee_for', 'rate_limit_hit',
                'log_security_event', 'health_check'
            ]) AS name
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = name
            )
        ),
        'missing_buckets', (
            SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb)
            FROM unnest(ARRAY['gallery', 'payment-proofs', 'products']) AS name
            WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = name)
        ),
        -- RLS coverage is worth reporting here too: a table that exists without it is the exact
        -- failure 0027 was written to make survivable, so a deployment should be able to say.
        'tables_without_rls', (
            SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
        ),
        'checked_at', to_jsonb(now())
    );
$$;

-- Called server-side with the service-role key, exactly like the rest of the health route. Nothing
-- else has any business enumerating the schema, so it is not on the public PostgREST surface.
REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC, anon, authenticated;
