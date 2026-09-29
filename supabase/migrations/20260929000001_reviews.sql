-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0016
--   • customer reviews, moderated before they appear
--   • the landing-page carousel stops being hardcoded copy
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. The table ────────────────────────────────────────────────────────────
-- Until now the review carousel rendered six quotes compiled into the component, each
-- hardcoded to five stars. That is business data the platform invented on the salon's
-- behalf, which rule 2 of PROMPTS.md forbids: "Never invent prices, ratings, discounts or
-- business claims … render nothing instead." Reviews now live here, and nothing reaches the
-- public page until a member of staff has approved it.
--
--   service_label  free text ("Bridal package", "Gold facial") — what the visit was for.
--   approved_by    which staff account vetted the row. Not readable from the browser at all
--                  (see the column grants in §2) — it is an audit trail, not display data.
--   source         'website' (submitted through the public form), 'imported' (carried over
--                  from the old hardcoded list, see §3) or 'admin' (entered in the console).
--
-- Deliberately NO contact details, no email, no phone. The public read policy exposes whole
-- rows, and row-level security cannot hide a column — anything in this table is readable by
-- anyone with the publishable key. A reviewer's email therefore belongs in a separate,
-- staff-only table if the salon ever wants one; it must not live here.
CREATE TABLE IF NOT EXISTS public.reviews (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    author_name     VARCHAR(80) NOT NULL,
    service_label   VARCHAR(80),
    rating          SMALLINT    NOT NULL DEFAULT 5,
    body            TEXT        NOT NULL,
    is_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
    approved_at     TIMESTAMPTZ,
    approved_by     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    source          VARCHAR(20) NOT NULL DEFAULT 'website',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT reviews_name_length  CHECK (char_length(btrim(author_name)) BETWEEN 2 AND 80),
    CONSTRAINT reviews_body_length  CHECK (char_length(btrim(body)) BETWEEN 10 AND 1200),

    -- An approved row must record when it was approved; a pending row must not carry a
    -- timestamp. This makes a half-applied moderation state unrepresentable, so the console
    -- cannot accidentally display "approved" rows that were never actually vetted.
    CONSTRAINT reviews_approval_shape CHECK (
        (is_approved = FALSE AND approved_at IS NULL)
        OR (is_approved = TRUE AND approved_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.reviews IS
    'Customer reviews, held for moderation. Publicly readable only when is_approved = true.';

-- One index serves both readers: the public feed is "approved, newest first" and the console
-- queue is "pending, oldest first" — both are scans of this same ordering.
CREATE INDEX IF NOT EXISTS reviews_feed_idx ON public.reviews (is_approved, created_at DESC);

-- ── §2. Authorization (RLS + column grants) ──────────────────────────────────
-- The public may read approved reviews and insert pending ones — nothing else. The insert
-- policy is what makes moderation real rather than cosmetic: a caller cannot hand in an
-- already-approved row, cannot stamp `approved_at`, and cannot label their own row 'admin'.
--
-- RLS is row-level, so on its own it would hand `approved_by` to any browser that asked for
-- it. The column grants below close that: `anon` and `authenticated` may read every column
-- except `approved_by`. Staff keep full row access through the RLS policies, so the console
-- still sees the pending queue.
--
-- ⚠ Consequence for code: PostgREST rejects `select=*` for these roles, because `*` includes
-- `approved_by`. Always name the columns you want (see the PUBLIC_SELECT constant in
-- lib/reviews-api.ts and REVIEW_COLUMNS in lib/reviews-admin-api.ts).
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON public.reviews FROM anon, authenticated;
GRANT SELECT (id, author_name, service_label, rating, body, is_approved, approved_at, source, created_at)
    ON public.reviews TO anon, authenticated;

DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read" ON public.reviews
    FOR SELECT TO anon, authenticated
    USING (is_approved = TRUE);

DROP POLICY IF EXISTS "reviews_public_insert" ON public.reviews;
CREATE POLICY "reviews_public_insert" ON public.reviews
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        is_approved = FALSE
        AND approved_at IS NULL
        AND approved_by IS NULL
        AND source = 'website'
        AND rating BETWEEN 1 AND 5
    );

DROP POLICY IF EXISTS "reviews_staff_read" ON public.reviews;
CREATE POLICY "reviews_staff_read" ON public.reviews
    FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "reviews_staff_update" ON public.reviews;
CREATE POLICY "reviews_staff_update" ON public.reviews
    FOR UPDATE USING (public.is_staff())
    WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "reviews_admin_delete" ON public.reviews;
CREATE POLICY "reviews_admin_delete" ON public.reviews
    FOR DELETE USING (public.is_admin());

-- ── §3. The six quotes that used to be hardcoded ─────────────────────────────
-- Carried over verbatim from components/public/ReviewCarousel.tsx so the owner's copy is not
-- lost, but inserted as PENDING. Nobody has verified the customers behind these names, and the
-- five stars were written into the markup rather than earned, so they must not go straight back
-- onto the live page. Approve the genuine ones in /admin/reviews — that is the only thing
-- standing between them and the site.
--
-- Idempotent: only seeds a table that is still empty, so re-running never duplicates them.
INSERT INTO public.reviews (author_name, service_label, rating, body, is_approved, source)
SELECT v.author_name, v.service_label, v.rating, v.body, FALSE, 'imported'
FROM (VALUES
    ('Sita J.',    'Bridal package',    5::SMALLINT,
     'They did my full bridal look and it lasted the whole night, even through all the dancing. My family still talks about the makeup.'),
    ('Anita P.',   'Keratin smoothing', 5::SMALLINT,
     'My hair was frizzy and unmanageable in the monsoon. After the keratin treatment it is smooth and I barely need to style it.'),
    ('Mina R.',    'Gel nail art',      5::SMALLINT,
     'The nail art is so neat and detailed. It lasted three weeks without chipping, and the price was exactly as shown online.'),
    ('Bimala S.',  'Hair spa',          5::SMALLINT,
     'Very relaxing hair spa. The staff explained what my hair actually needed instead of just selling the most expensive option.'),
    ('Sarita K.',  'Gold facial',       5::SMALLINT,
     'Booked a gold facial before my brother’s wedding. My skin looked fresh and glowing in all the photos.'),
    ('Nirmala D.', 'Beautician course', 5::SMALLINT,
     'I finished the 12-week course and now work at a parlour in Tikapur. Practising on real clients gave me real confidence.')
) AS v(author_name, service_label, rating, body)
WHERE NOT EXISTS (SELECT 1 FROM public.reviews);

-- ── §4. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    n_policies  INT;
    n_imported  INT;
    can_read_by BOOLEAN;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reviews'
    ) THEN
        RAISE EXCEPTION '0016 failed: public.reviews was not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relname = 'reviews' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION '0016 failed: RLS is not enabled on public.reviews';
    END IF;

    SELECT count(*) INTO n_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews';

    IF n_policies < 5 THEN
        RAISE EXCEPTION '0016 failed: expected 5 policies on public.reviews, found %', n_policies;
    END IF;

    -- The leak this migration exists to avoid: a browser must not be able to read `approved_by`.
    SELECT has_column_privilege('anon', 'public.reviews', 'approved_by', 'SELECT')
    INTO can_read_by;
    IF can_read_by THEN
        RAISE EXCEPTION '0016 failed: anon can still read reviews.approved_by';
    END IF;

    SELECT count(*) INTO n_imported FROM public.reviews WHERE source = 'imported';

    RAISE NOTICE '0016 applied: public.reviews, % policies, approved_by unreadable by anon, % imported quote(s) awaiting approval',
        n_policies, n_imported;
END $$;
