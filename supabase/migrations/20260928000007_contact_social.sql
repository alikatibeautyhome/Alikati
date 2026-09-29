-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0007: public contact details and social profiles
--
-- These drive the footer, the contact page, the WhatsApp links and the `sameAs` array in the
-- BeautySalon structured data. The owner can change all of them from /admin/settings.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.salon_settings
    ADD COLUMN email         VARCHAR(160) DEFAULT 'alikatibeautyhome@gmail.com',
    ADD COLUMN facebook_url  TEXT,
    ADD COLUMN instagram_url TEXT,
    ADD COLUMN tiktok_url    TEXT;

COMMENT ON COLUMN public.salon_settings.email IS
    'Public contact address shown in the footer and on the contact page.';
COMMENT ON COLUMN public.salon_settings.facebook_url IS
    'Full Facebook page URL, including the share token if one is used.';
COMMENT ON COLUMN public.salon_settings.instagram_url IS
    'Full Instagram profile URL.';
COMMENT ON COLUMN public.salon_settings.tiktok_url IS
    'Full TikTok profile URL.';

-- Owner-supplied details. Tracked in git, so re-running is harmless.
UPDATE public.salon_settings
SET phone           = '+977-9869512756',
    whatsapp_number = '9779869512756',
    email           = 'alikatibeautyhome@gmail.com',
    facebook_url    = 'https://www.facebook.com/share/1Dgw2YFiiZ/',
    instagram_url   = 'https://www.instagram.com/nirmala_khadka098',
    tiktok_url      = 'https://www.tiktok.com/@alikatibeautyhome5'
WHERE id = 1;
