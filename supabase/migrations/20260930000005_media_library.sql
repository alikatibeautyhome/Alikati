-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0023
--   • a media library with its own categories, so editorial assets have a home
--   • payment QRs stay out of it: they are configuration, not content
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why a library at all ─────────────────────────────────────────────────
-- Until now every uploaded asset lived as a bare URL in whichever column happened to need it: a
-- product's `images`, a category's `image_url`, a hero's settings row, the watermark, a payment QR.
-- Nothing listed them, so a file could only be found by remembering where it was used, and nothing
-- could be reused. This is the catalogue of what has been uploaded.
--
-- Files themselves stay in the public `gallery` bucket under `{category_slug}/{filename}` — the
-- bucket is already the project's public asset store and needs no new policies. The tables here
-- record what is in it; they do not hold the bytes.
CREATE TABLE IF NOT EXISTS public.media_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          VARCHAR(60) NOT NULL UNIQUE,
    name          VARCHAR(80) NOT NULL,
    -- Seeded categories cannot be deleted: the library's filters would empty out and any asset
    -- filed under one would be orphaned with no way to find it again.
    is_system     BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT media_categories_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS public.media_assets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SET NULL rather than CASCADE: deleting a category must not silently delete the images filed
    -- under it. The asset survives as uncategorised and can be refiled.
    category_id  UUID REFERENCES public.media_categories(id) ON DELETE SET NULL,
    -- Path inside the bucket, kept so the object can be removed and so `{category_slug}/…` can be
    -- verified. `url` is the public URL the site embeds.
    path         TEXT NOT NULL,
    url          TEXT NOT NULL,
    filename     TEXT NOT NULL,
    mime_type    VARCHAR(80),
    size_bytes   BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT media_assets_path_unique UNIQUE (path)
);

CREATE INDEX IF NOT EXISTS media_assets_category_created_idx
    ON public.media_assets (category_id, created_at DESC);

COMMENT ON TABLE  public.media_categories IS
    'Folders for the admin media library. The four defaults are seeded with is_system = true.';
COMMENT ON TABLE  public.media_assets IS
    'Catalogue of files uploaded to the public gallery bucket. The bytes live in Storage, not here.';
COMMENT ON COLUMN public.media_assets.path IS
    'Object path inside the gallery bucket, e.g. product-images/1727-abc.png.';

-- The four defaults the brief names. `ON CONFLICT DO NOTHING` so re-running the migration cannot
-- duplicate them, and so an owner who has renamed one keeps their name.
INSERT INTO public.media_categories (slug, name, is_system, display_order) VALUES
    ('product-images',    'Product Images',     TRUE, 0),
    ('hero-banners',      'Hero & Banners',     TRUE, 1),
    ('watermarks-logos',  'Watermarks & Logos', TRUE, 2),
    ('general-gallery',   'General Gallery',    TRUE, 3)
ON CONFLICT (slug) DO NOTHING;

-- ── §2. Access ───────────────────────────────────────────────────────────────
-- Staff only, and unlike the payment accounts there is no public read. The storefront embeds asset
-- URLs directly and never queries these tables, so nothing on the public site needs them — and the
-- narrower the surface, the less there is to get wrong. Note this is a **table-level** grant: the
-- lesson from 0020 is that column grants break any `select('*')`, which is what this library uses.
ALTER TABLE public.media_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.media_categories FROM anon, authenticated;
REVOKE ALL ON public.media_assets     FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets     TO authenticated;

DROP POLICY IF EXISTS "media_categories_staff_all" ON public.media_categories;
CREATE POLICY "media_categories_staff_all" ON public.media_categories
    FOR ALL TO authenticated
    USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "media_assets_staff_all" ON public.media_assets;
CREATE POLICY "media_assets_staff_all" ON public.media_assets
    FOR ALL TO authenticated
    USING (public.is_staff()) WITH CHECK (public.is_staff());

-- A seeded category is protected from deletion in the database, not only in the interface, so an
-- API call cannot remove the library's own filters.
CREATE OR REPLACE FUNCTION public.protect_system_media_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_system THEN
        RAISE EXCEPTION 'The "%" category is built in and cannot be deleted.', OLD.name;
    END IF;
    RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS media_categories_protect_system ON public.media_categories;
CREATE TRIGGER media_categories_protect_system
    BEFORE DELETE ON public.media_categories
    FOR EACH ROW EXECUTE FUNCTION public.protect_system_media_categories();
