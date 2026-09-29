-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0013
--   • editable landing-page hero (image + copy) controlled from the admin console
--   • the payment QR can now carry the order amount
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Landing page hero, editable from admin ───────────────────────────────
-- The hero previously used a bundled placeholder illustration. The owner can now upload the
-- real salon photograph and adjust the wording without a developer.
ALTER TABLE public.salon_settings
    ADD COLUMN IF NOT EXISTS hero_image_url    TEXT,
    ADD COLUMN IF NOT EXISTS hero_heading      TEXT,
    ADD COLUMN IF NOT EXISTS hero_subheading   TEXT,
    -- Smaller image shown beside the hero on desktop; optional.
    ADD COLUMN IF NOT EXISTS hero_badge_text   TEXT;

UPDATE public.salon_settings
SET hero_heading = COALESCE(
        hero_heading,
        'Salon, bridal studio and shop in Attariya Chowk'
    ),
    hero_subheading = COALESCE(
        hero_subheading,
        'Book hair, skin, bridal and nail services, or order the products our stylists use — delivered across Kailali.'
    )
WHERE id = 1;

-- ── §2. Amount-aware payment QR ──────────────────────────────────────────────
-- `payment_qr_content` may contain the literal token `{amount}`, which the checkout replaces
-- with the live order total before drawing the QR. e.g.
--     esewa:9869512756?amount={amount}   →   esewa:9869512756?amount=1800
--
-- Two honest caveats, also surfaced in the admin hint:
--   • Whether the customer's wallet pre-fills that amount depends on the provider's QR format.
--     A genuinely provider-validated dynamic QR (Fonepay/eSewa merchant dynamic QR) needs
--     merchant API credentials, which is a separate integration.
--   • Because of that, the checkout ALWAYS prints the amount next to the code as well, so the
--     customer can never be unsure what to pay.
UPDATE public.salon_settings
SET payment_qr_content = 'esewa:9869512756?amount={amount}'
WHERE id = 1
  AND (payment_qr_content IS NULL OR position('{amount}' IN payment_qr_content) = 0);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'salon_settings'
          AND column_name = 'hero_image_url'
    ) THEN
        RAISE EXCEPTION '0013 failed: hero_image_url was not added';
    END IF;
    RAISE NOTICE '0013 applied: editable hero + amount-aware payment QR';
END $$;
