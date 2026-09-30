-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0025
--   • the shop can be filtered by retail vs salon backbar, and by concern
--   • sizes and strengths of one product become variants of it, not strangers
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Two new facets ───────────────────────────────────────────────────────
-- The catalogue is one flat list. A walk-in buying a face wash and a stylist restocking developer
-- are looking at the same grid, and the only way to narrow it is the category — which is a brand,
-- not a shelf. These two columns are the two questions a shopper actually asks: "is this for me at
-- home, or is it a salon product?" and "what does it treat?".
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS use_type VARCHAR(20) NOT NULL DEFAULT 'retail',
    ADD COLUMN IF NOT EXISTS concerns TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_use_type_known;
ALTER TABLE public.products
    ADD CONSTRAINT products_use_type_known CHECK (use_type IN ('retail', 'professional'));

COMMENT ON COLUMN public.products.use_type IS
    'retail = sold to walk-in customers; professional = salon backbar / trade supply.';
COMMENT ON COLUMN public.products.concerns IS
    'What the product is for, e.g. {Acne & Blemish, Sunscreen & UV}. Drives the concern filter.';

CREATE INDEX IF NOT EXISTS products_use_type_idx ON public.products (use_type);
CREATE INDEX IF NOT EXISTS products_concerns_idx  ON public.products USING GIN (concerns);

-- ── §2. Classify what is already in the catalogue ────────────────────────────
-- Backfilled rather than left at the default, because a filter that returns everything is worse
-- than no filter. The rules are deliberately conservative and readable: a professional salon line
-- is professional, and everything a customer would buy for themselves is retail.

-- Lotus Professional is the salon-only line; Well 10 and the peroxide developers are trade stock
-- a stylist buys by the dozen, not something a walk-in takes home.
UPDATE public.products
SET use_type = 'professional'
WHERE use_type = 'retail'
  AND (
        brand = 'Lotus Professional'
     OR brand = 'Well 10'
     OR name ILIKE '%developer%'
     OR name ILIKE '%blonder%'
     OR name ILIKE '%hair colour%'
     OR name ILIKE '%hair color%'
  );

-- Concerns, in the five groups the brief asks for. A product can carry more than one — a
-- niacinamide serum is both whitening/glow and (depending on the line) acne care — so this is a
-- set rather than a single label. Rules are ordered so the more specific match lands first.
UPDATE public.products SET concerns = (
    SELECT ARRAY(
        SELECT DISTINCT c FROM unnest(ARRAY[
            CASE WHEN name ILIKE '%sunscreen%' OR name ILIKE '%spf%' OR name ILIKE '%sun serum%'
                 THEN 'Sunscreen & UV' END,
            CASE WHEN brand = 'Acnes'
                   OR name ILIKE '%acne%'
                   OR name ILIKE '%blemish%'
                   OR name ILIKE '%creamy wash%'
                   OR name ILIKE '%face wash%'
                   OR name ILIKE '%cleanser%'
                 THEN 'Acne & Blemish' END,
            CASE WHEN name ILIKE '%whitening%'
                   OR name ILIKE '%glow%'
                   OR name ILIKE '%niacinamide%'
                   OR name ILIKE '%vitamin c%'
                   OR name ILIKE '%brightening%'
                   OR name ILIKE '%toner%'
                 THEN 'Whitening & Glow' END,
            CASE WHEN name ILIKE '%anti-aging%'
                   OR name ILIKE '%anti aging%'
                   OR name ILIKE '%retinol%'
                   OR name ILIKE '%hyaluronic%'
                   OR name ILIKE '%night cream%'
                   OR name ILIKE '%massage cream%'
                 THEN 'Anti-Aging' END,
            CASE WHEN name ILIKE '%colour%'
                   OR name ILIKE '%color%'
                   OR name ILIKE '%developer%'
                   OR name ILIKE '%blonder%'
                 THEN 'Hair Color' END
        ]) AS c WHERE c IS NOT NULL
    )
)
WHERE concerns = '{}';

-- ── §3. Variants ─────────────────────────────────────────────────────────────
-- 100 g and 60 g of the same hair colour are two rows with two prices, and on the shop they read
-- as two unrelated products. Someone comparing sizes has to find both and work out that they are
-- the same thing.
--
-- `variant_group` links siblings; `variant_value` names the option. They are separate rows on
-- purpose — each has its own stock count, which is the whole reason they were modelled that way —
-- so the product page shows the siblings as a size picker and swaps between them. Price and stock
-- therefore stay per-variant and per-row, which is what the stock system already depends on.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS variant_group VARCHAR(80),
    ADD COLUMN IF NOT EXISTS variant_value VARCHAR(60);

COMMENT ON COLUMN public.products.variant_group IS
    'Shared key linking sibling sizes/strengths of one product. NULL when the product stands alone.';
COMMENT ON COLUMN public.products.variant_value IS
    'This row''s option within its group, e.g. "100 gm" or "12%".';

CREATE INDEX IF NOT EXISTS products_variant_group_idx
    ON public.products (variant_group) WHERE variant_group IS NOT NULL;

-- Well 10 hair colour, by the pack size.
UPDATE public.products
SET variant_group = 'well-10-hair-colour',
    variant_value = CASE
        WHEN name ILIKE '%100 gm%' OR name ILIKE '%100g%' THEN '100 gm'
        WHEN name ILIKE '%60 gm%'  OR name ILIKE '%60g%'  THEN '60 gm'
    END
WHERE brand = 'Well 10' AND name ILIKE '%hair colour%';

-- Well 10 peroxide developer, by strength.
UPDATE public.products
SET variant_group = 'well-10-developer',
    variant_value = substring(name FROM '(\d+)%') || '%'
WHERE name ILIKE '%developer%' AND name ~ '\d+%';

-- Anything that matched a group but has no value would be a half-linked sibling, which would
-- render a picker with a blank option. Unlink those rather than ship them.
UPDATE public.products
SET variant_group = NULL
WHERE variant_group IS NOT NULL AND variant_value IS NULL;

-- ── §4. Read the new columns ─────────────────────────────────────────────────
-- The storefront queries products with `select('*')`, so a table-level grant is what is needed —
-- the same lesson migration 0021 recorded after column grants broke the payment step.
-- `products` already carries `GRANT SELECT ... TO anon, authenticated` from the e-commerce
-- migration; re-stated here so it is obvious that these two columns are intentionally public.
GRANT SELECT ON public.products TO anon, authenticated;
