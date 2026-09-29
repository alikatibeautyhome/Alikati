-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0014: hero slideshow
--
-- The landing hero was a single image (`salon_settings.hero_image_url`, migration 0013). The
-- owner wants several photographs rotating. Those live here rather than in a JSON blob so they
-- can be ordered, disabled and captioned individually — and so the public page can fetch just
-- the active ones.
--
-- `hero_image_url` is kept as a fallback: with no slides, the hero still shows it, and with
-- neither it shows the bundled placeholder.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hero_slides (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url     TEXT NOT NULL,
    /** Read aloud by screen readers — describe the photo, not the file name. */
    alt_text      VARCHAR(180),
    /** Optional per-slide override of the hero heading. */
    heading       VARCHAR(120),
    subheading    VARCHAR(200),
    display_order INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- The storefront only ever asks for active slides in display order.
CREATE INDEX IF NOT EXISTS idx_hero_slides_active_order
    ON public.hero_slides (display_order)
    WHERE is_active;

DROP TRIGGER IF EXISTS trg_hero_slides_updated ON public.hero_slides;
CREATE TRIGGER trg_hero_slides_updated
    BEFORE UPDATE ON public.hero_slides
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Access ───────────────────────────────────────────────────────────────────
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_slides_public_read" ON public.hero_slides;
CREATE POLICY "hero_slides_public_read" ON public.hero_slides
    FOR SELECT TO anon, authenticated
    USING (is_active OR public.is_staff());

DROP POLICY IF EXISTS "hero_slides_staff_write" ON public.hero_slides;
CREATE POLICY "hero_slides_staff_write" ON public.hero_slides
    FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

-- ── Preserve whatever hero image is already configured ───────────────────────
-- Seeds a first slide from the old single-image field so the slideshow is never empty for an
-- owner who had already uploaded a photograph. Skipped if slides already exist.
INSERT INTO public.hero_slides (image_url, alt_text, display_order, is_active)
SELECT
    s.hero_image_url,
    'Alikati Beauty Home',
    0,
    TRUE
FROM public.salon_settings s
WHERE s.id = 1
  AND s.hero_image_url IS NOT NULL
  AND btrim(s.hero_image_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.hero_slides);

DO $$
DECLARE
    v_slides INT;
    v_policies INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'hero_slides' AND relrowsecurity) THEN
        RAISE EXCEPTION '0014 failed: hero_slides does not have RLS enabled';
    END IF;

    SELECT count(*) INTO v_policies FROM pg_policies WHERE tablename = 'hero_slides';
    IF v_policies < 2 THEN
        RAISE EXCEPTION '0014 failed: expected public-read and staff-write policies, found %', v_policies;
    END IF;

    SELECT count(*) INTO v_slides FROM public.hero_slides;
    RAISE NOTICE '0014 applied: hero_slides ready (% slide(s) seeded)', v_slides;
END $$;
