-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0015
--   • owner-controlled promotional band for the landing page
--   • optional product ratings, so the new storefront card design can show stars
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Promotional band ─────────────────────────────────────────────────────
-- The reference storefront has a "Limited Time Offer — Up to 30% OFF" strip between the
-- category grid and the best sellers. Everything about it is the owner's copy: this platform
-- must never invent a discount claim on the shop's behalf.
ALTER TABLE public.salon_settings
    ADD COLUMN IF NOT EXISTS promo_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS promo_eyebrow      TEXT DEFAULT 'Limited time offer',
    ADD COLUMN IF NOT EXISTS promo_headline     TEXT DEFAULT 'Festival offers are live',
    ADD COLUMN IF NOT EXISTS promo_subheadline  TEXT DEFAULT 'See everything currently reduced across the shop.',
    ADD COLUMN IF NOT EXISTS promo_cta_label    TEXT DEFAULT 'Shop the offers',
    ADD COLUMN IF NOT EXISTS promo_href         TEXT DEFAULT '/shop';

-- ── §2. Product ratings ──────────────────────────────────────────────────────
-- The new card design shows "★ 4.8 (265)" under a product. Those numbers must come from real
-- customer feedback, so the columns are NULL by default and the card renders stars only when a
-- rating has actually been entered in the admin console.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS rating_average NUMERIC(2,1),
    ADD COLUMN IF NOT EXISTS rating_count   INT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.products
        WHERE rating_average IS NOT NULL AND (rating_average < 0 OR rating_average > 5)
    ) THEN
        RAISE EXCEPTION '0015: rating_average must be between 0 and 5';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'products_rating_average_range'
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT products_rating_average_range
            CHECK (rating_average IS NULL OR (rating_average >= 0 AND rating_average <= 5));
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '0015 constraint note: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='salon_settings' AND column_name='promo_headline'
    ) THEN
        RAISE EXCEPTION '0015 failed: promo columns were not added';
    END IF;
    RAISE NOTICE '0015 applied: promo band settings + optional product ratings';
END $$;
