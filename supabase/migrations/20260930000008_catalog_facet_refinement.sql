-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0026
--   • finish classifying the catalogue 0025 started
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Why a second pass ────────────────────────────────────────────────────────
-- 0025 added `use_type` and `concerns` and classified by name, and a count afterwards showed 26 of
-- 69 products still carrying no concern at all — invisible to the very filter the column was added
-- for. It also missed the nine **Well 10 Professional** items, because the rule matched
-- `brand = 'Well 10'` and their brand is spelled with the suffix; salon-size treatments were left
-- sitting in the retail shelf.
--
-- Rather than rewrite 0025 (already applied, and its `WHERE concerns = '{}'` guard means re-running
-- it would skip everything), this finishes the job as its own step. Rules here only ever ADD to a
-- product that has no concern yet, so nothing classified by 0025 is overwritten.

-- ── §1. Well 10 Professional: salon stock, not retail ────────────────────────
-- Only the large sizes and the in-salon treatments. A 50 ml serum or a shampoo is something a
-- customer does take home, so those stay retail — the point of the facet is to be useful, not to
-- move a whole brand into one bucket.
UPDATE public.products
SET use_type = 'professional'
WHERE brand ILIKE 'Well 10%'
  AND use_type = 'retail'
  AND (
        name ILIKE '%treatment%'
     OR name ILIKE '%botox%'
     OR name ILIKE '%keratin%'
     OR name ILIKE '%spa%'
     OR name ILIKE '%1000 gm%'
     OR name ILIKE '%500 gm%'
  );

-- ── §2. The products 0025 did not reach ──────────────────────────────────────
-- Same five groups, extended to the words the first pass missed: the professional facial lines
-- (pigmentation, detan, gold, Miraki), the scrub and soothing products, and the plain moisturisers
-- and mists. A moisturiser under Anti-Aging is a judgement call — hydration is the base layer of
-- every anti-ageing routine, and leaving it out means a shopper filtering for ageing sees no
-- moisturiser at all, which is worse.
UPDATE public.products SET concerns = (
    SELECT ARRAY(
        SELECT DISTINCT c FROM unnest(ARRAY[
            CASE WHEN name ILIKE '%pigment%'
                   OR name ILIKE '%detan%'
                   OR name ILIKE '%gold%'
                   OR name ILIKE '%miraki%'
                   OR name ILIKE '%rose water%'
                   OR name ILIKE '%facial mist%'
                   OR name ILIKE '%brightening%'
                 THEN 'Whitening & Glow' END,
            CASE WHEN name ILIKE '%derma%'
                   OR name ILIKE '%scrub%'
                   OR name ILIKE '%custin%'
                   OR name ILIKE '%green tea%'
                   OR name ILIKE '%soothe%'
                 THEN 'Acne & Blemish' END,
            CASE WHEN name ILIKE '%moisturizer%'
                   OR name ILIKE '%moisturiser%'
                   OR name ILIKE '%rejuvina%'
                 THEN 'Anti-Aging' END,
            -- These two are colour work even though neither says "colour": a red brilliance
            -- treatment is a tint, and a purple shampoo is the toner blondes use to kill brass.
            CASE WHEN name ILIKE '%brilliance%'
                   OR name ILIKE '%purple shampoo%'
                 THEN 'Hair Color' END
        ]) AS c WHERE c IS NOT NULL
    )
)
WHERE concerns = '{}';

-- ── §3. Report the remainder ─────────────────────────────────────────────────
-- Anything still unclassified is allowed to stay that way — the Well 10 shampoos, serums and the
-- Streax hair serum are hair care, and none of the five concerns honestly describes them. They are
-- still reachable by category, brand and use-type; they simply do not answer a skin-concern
-- question. Recorded here so the count is a deliberate outcome rather than a surprise.
COMMENT ON COLUMN public.products.concerns IS
    'What the product is for, e.g. {Acne & Blemish, Sunscreen & UV}. Drives the concern filter. '
    'May legitimately be empty: hair care that answers none of the five concerns is reachable by '
    'category, brand and use_type instead.';
