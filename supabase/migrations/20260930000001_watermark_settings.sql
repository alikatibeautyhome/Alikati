-- Product watermark / logo settings.
--
-- Three columns on the single-row `salon_settings` table, following the pattern of migrations
-- 0008 / 0011 / 0013 / 0015 rather than introducing a key/value settings table:
--
--   watermark_enabled   Master switch for the brand badge drawn over product imagery.
--   watermark_logo_url  Public URL of the uploaded PNG. NULL means "nothing uploaded", which the
--                       storefront renders as no badge at all — never an empty box or a broken
--                       image tag.
--   watermark_size_px   Badge height in CSS pixels, bounded to the range the admin slider offers.
--
-- Only the URL is stored, not the binary: the PNG goes to the existing public `gallery` bucket
-- (which already allows image/png at 8 MB) and the settings row keeps a short string, so the asset
-- is CDN-served and the row stays cheap to read on every page render.

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS watermark_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS watermark_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS watermark_size_px  INTEGER NOT NULL DEFAULT 44;

-- Bounded in the database as well as in the slider, so a direct API call cannot store a value the
-- interface has no way to represent or clear.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salon_settings_watermark_size_px_check'
  ) THEN
    ALTER TABLE public.salon_settings
      ADD CONSTRAINT salon_settings_watermark_size_px_check
      CHECK (watermark_size_px BETWEEN 32 AND 64);
  END IF;
END $$;

COMMENT ON COLUMN public.salon_settings.watermark_logo_url IS
  'Public URL of the PNG brand mark overlaid on product imagery. NULL = not set.';
COMMENT ON COLUMN public.salon_settings.watermark_size_px IS
  'Height of the product-image badge in CSS pixels (32-64).';

-- Existing staff-update policies on `salon_settings` already cover these columns, so no new RLS
-- rule is needed: whoever may edit the salon's phone number may edit its watermark.
