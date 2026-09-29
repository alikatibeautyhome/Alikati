-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0017
--   • affiliate applications carry social accounts
--   • an application with no presence is not reviewable, so it cannot be submitted
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. The columns ──────────────────────────────────────────────────────────
-- The programme is approved on the strength of an applicant's audience, but 0008 left nowhere to
-- record it: staff were deciding on a name and a phone number alone, and whatever the applicant
-- said about their reach existed only outside the system.
--
-- Naming and shape mirror `salon_settings` from 0007 — three nullable `*_url` columns holding
-- full `https://` URLs — so the two tables in this schema that describe social accounts describe
-- them the same way.
--
-- Facebook keeps whatever path the applicant supplied, because real profile links look like
-- `facebook.com/share/1Dgw2YFiiZ/` and a two-segment path must survive intact. Instagram and
-- TikTok are canonicalised to `<host>/<handle>`.
ALTER TABLE public.affiliates
    ADD COLUMN IF NOT EXISTS facebook_url  VARCHAR(200),
    ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(200),
    ADD COLUMN IF NOT EXISTS tiktok_url    VARCHAR(200);

COMMENT ON COLUMN public.affiliates.facebook_url IS
    'Applicant Facebook profile URL, as supplied (kept verbatim — share links have two path segments).';
COMMENT ON COLUMN public.affiliates.instagram_url IS
    'Canonical Instagram profile URL, https://www.instagram.com/<handle>.';
COMMENT ON COLUMN public.affiliates.tiktok_url IS
    'Canonical TikTok profile URL, https://www.tiktok.com/@<handle>.';

-- Shape constraints. A blank string is treated as absent rather than rejected, so a form that
-- posts `""` for an untouched field cannot fail the insert with a confusing constraint error.
-- These mirror the client-side rules in `lib/socials.ts`; that module is the friendly explanation,
-- this is the guarantee.
ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_facebook_url_shape;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_facebook_url_shape CHECK (
    NULLIF(btrim(facebook_url), '') IS NULL
    OR (
        btrim(facebook_url) ~* '^https://(www\.|m\.|web\.)?(facebook\.com|fb\.com|fb\.me)/\S+$'
        AND char_length(btrim(facebook_url)) <= 200
    )
);

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_instagram_url_shape;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_instagram_url_shape CHECK (
    NULLIF(btrim(instagram_url), '') IS NULL
    OR (
        btrim(instagram_url) ~* '^https://(www\.)?instagram\.com/\S+$'
        AND char_length(btrim(instagram_url)) <= 200
    )
);

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_tiktok_url_shape;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_tiktok_url_shape CHECK (
    NULLIF(btrim(tiktok_url), '') IS NULL
    OR (
        btrim(tiktok_url) ~* '^https://(www\.)?tiktok\.com/@?\S+$'
        AND char_length(btrim(tiktok_url)) <= 200
    )
);

-- ── §2. An application must show at least one account ────────────────────────
-- Enforced in the INSERT policy rather than a CHECK constraint, and this distinction is the whole
-- point: the requirement applies to *applicants*, not to rows. Staff editing an approved member in
-- the console — clearing a dead TikTok link, say — must not be blocked by a rule about applying.
--
-- Rewritten from 0008; the earlier terms (pending, zero earnings) are unchanged.
DROP POLICY IF EXISTS affiliates_apply_public ON public.affiliates;
CREATE POLICY affiliates_apply_public ON public.affiliates
    FOR INSERT WITH CHECK (
        status = 'pending'
        AND total_earned_npr = 0
        AND total_paid_npr = 0
        AND COALESCE(
              NULLIF(btrim(facebook_url), ''),
              NULLIF(btrim(instagram_url), ''),
              NULLIF(btrim(tiktok_url), '')
            ) IS NOT NULL
    );

-- ── §3. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_cols INT;
    policy_requires_social BOOLEAN;
BEGIN
    SELECT count(*) INTO n_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliates'
      AND column_name IN ('facebook_url', 'instagram_url', 'tiktok_url');

    IF n_cols <> 3 THEN
        RAISE EXCEPTION '0017 failed: expected 3 social columns on affiliates, found %', n_cols;
    END IF;

    -- The policy's WITH CHECK must actually mention the social requirement; a policy that lost it
    -- in an edit would otherwise pass every other check here.
    SELECT COALESCE(with_check, '') ILIKE '%facebook_url%' INTO policy_requires_social
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliates' AND policyname = 'affiliates_apply_public';

    IF NOT policy_requires_social THEN
        RAISE EXCEPTION '0017 failed: affiliates_apply_public does not require a social account';
    END IF;

    RAISE NOTICE '0017 applied: 3 social columns on affiliates; public applications require at least one';
END $$;
