-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0011
--   §1 staff account management (activate/deactivate without deleting the auth user)
--   §2 FIX: is_staff() never checked the role
--   §3 payment QR + proof-of-payment uploads
--   §4 Nepali (Bikram Sambat) date display + coupon duration defaults
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Staff account management ─────────────────────────────────────────────
-- Deleting an auth user would orphan their order/appointment history, so staff are
-- deactivated instead. `is_active` is read by the helpers above.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS phone         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles (is_active) WHERE is_active;

-- Admins may edit other people's profiles (role changes, deactivation, correction of names).
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Staff may see the team list (needed by the admin console's users screen).
DROP POLICY IF EXISTS "profiles_staff_select" ON public.profiles;
CREATE POLICY "profiles_staff_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_staff() OR id = auth.uid());

-- ── §2. is_staff() / is_admin() were checking only that a row EXISTED ─────────
-- As shipped, is_staff() was:
--     SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
-- It never inspected `role` or `is_active`, so every RLS policy in the database —
-- orders, customers, coupons, appointments, storage — treated ANY profile row as staff.
-- Today only invited staff hold a profile (migration 0010 stopped customers getting one),
-- so this is a latent hole rather than an open door: the moment a profile row is created for
-- any other purpose, that account inherits full staff reach. Both helpers now verify the
-- role, and honour `is_active` so deactivating a person revokes access immediately.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'staff')
          AND COALESCE(is_active, TRUE)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND COALESCE(is_active, TRUE)
    );
$$;

-- ── §3. Payment proof and QR payment settings ────────────────────────────────
-- Customers pay by eSewa / Khalti / bank transfer and upload the statement screenshot;
-- staff review it against the order. `payment_reference` stores the transaction id the
-- customer types in.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_proof_url  TEXT,
    ADD COLUMN IF NOT EXISTS payment_reference  VARCHAR(80);

-- ── §4. Settings for the payment screen, Nepali dates and coupon defaults ────
ALTER TABLE public.salon_settings
    ADD COLUMN IF NOT EXISTS payment_qr_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    -- What the generated QR encodes, e.g. "esewa:9869512756" or a bank/payment URI.
    ADD COLUMN IF NOT EXISTS payment_qr_content     TEXT DEFAULT 'esewa:9869512756',
    -- If the owner uploads their own QR (from the eSewa/Khalti app), it wins over the generated one.
    ADD COLUMN IF NOT EXISTS payment_qr_image_url   TEXT,
    ADD COLUMN IF NOT EXISTS payment_note           TEXT
        DEFAULT 'Scan the QR to pay, then upload your payment screenshot below. We confirm on WhatsApp.',
    -- Default validity applied to a new coupon (days), used by the admin duration presets.
    ADD COLUMN IF NOT EXISTS coupon_default_days    INT NOT NULL DEFAULT 7,
    -- Show Bikram Sambat dates alongside AD dates across the site and admin.
    ADD COLUMN IF NOT EXISTS nepali_dates           BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.salon_settings
        WHERE coupon_default_days IS NULL OR coupon_default_days < 1 OR coupon_default_days > 365
    ) THEN
        UPDATE public.salon_settings SET coupon_default_days = 7 WHERE coupon_default_days IS NULL;
        RAISE NOTICE 'coupon_default_days reset to 7 for out-of-range values';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'coupon_default_days check skipped: %', SQLERRM;
END $$;

-- ── §5. Private bucket for payment statements ────────────────────────────────
-- Deliberately NOT public: these are customers' payment screenshots, which can expose
-- account balances and names. Staff read them through short-lived signed URLs.
--
-- Anyone may upload (checkout happens before sign-in, and a guest must still be able to
-- prove payment), but nobody anonymous can read the bucket back. Uploads are capped at
-- 5 MB and restricted to images/PDF.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs', 'payment-proofs', FALSE, 5242880,
    ARRAY['image/png','image/jpeg','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/heic','application/pdf'];

DROP POLICY IF EXISTS "payment_proofs_anyone_upload" ON storage.objects;
CREATE POLICY "payment_proofs_anyone_upload" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "payment_proofs_staff_read" ON storage.objects;
CREATE POLICY "payment_proofs_staff_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.is_staff());

DROP POLICY IF EXISTS "payment_proofs_admin_delete" ON storage.objects;
CREATE POLICY "payment_proofs_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.is_admin());

-- ── §6. Verification ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_staff_role TEXT;
    v_admin_role TEXT;
BEGIN
    -- The helpers must now consult the role column, not merely the row's existence.
    SELECT pg_get_functiondef('public.is_staff()'::regprocedure) INTO v_staff_role;
    IF position('role IN' IN v_staff_role) = 0 THEN
        RAISE EXCEPTION 'is_staff() still does not check the role';
    END IF;
    IF position('is_active' IN v_staff_role) = 0 THEN
        RAISE EXCEPTION 'is_staff() ignores is_active — deactivation would not revoke access';
    END IF;

    SELECT pg_get_functiondef('public.is_admin()'::regprocedure) INTO v_admin_role;
    IF position('role = ''admin''' IN v_admin_role) = 0 THEN
        RAISE EXCEPTION 'is_admin() does not check for the admin role';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs' AND NOT public) THEN
        RAISE EXCEPTION 'payment-proofs bucket missing or public';
    END IF;

    RAISE NOTICE '0011 applied: role-aware staff checks, payment proofs, Nepali date settings';
END $$;
