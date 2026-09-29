-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0021
--   • anon can actually read the payment accounts
--   • a table-level SELECT, not the column list 0020 used
-- ═════════════════════════════════════════════════════════════════════════════

-- ── What went wrong in 0020 ──────────────────────────────────────────────────
-- 0020 revoked SELECT and re-granted it column by column, copying the pattern from `reviews`:
--
--     REVOKE SELECT ON public.payment_accounts FROM anon, authenticated;
--     GRANT  SELECT (id, label, kind, …) ON public.payment_accounts TO anon, authenticated;
--
-- That pattern is right for `reviews`, which hides internal columns (`approved_by`, `source`) from
-- anonymous readers while still letting them select the published ones — and `reviews` works
-- because every query against it names its columns explicitly (`REVIEW_COLUMNS`).
--
-- It is wrong here. `payment_accounts` has nothing to withhold: every column is either the label
-- the customer picks, the account to pay into, or ordering metadata the customer-facing query sorts
-- by. The application reads it with `select('*')`, and `select('*')` needs SELECT on the **table**,
-- not on a list of columns — so the checkout's own query was refused with `42501 permission denied`
-- and the payment step would have shown a customer nothing at all. `has_any_column_privilege` was
-- true the whole time, which is what made this quiet: the grant looked present in the schema dump.
--
-- Verified before and after with an anonymous key, because that is the role that actually renders
-- the checkout.
REVOKE SELECT ON public.payment_accounts FROM anon, authenticated;
GRANT  SELECT ON public.payment_accounts TO anon, authenticated;

COMMENT ON TABLE public.payment_accounts IS
    'One row per payment destination the shop accepts (bank, wallet or other), each with its own QR. '
    'Readable in full by anonymous visitors: the shop publishes these details so customers can pay. '
    'Visibility is controlled by `is_active`, enforced in the RLS policy, not by column privileges.';

-- The column-level grants 0020 left behind are now redundant alongside the table-level one. Removed
-- so the schema says one thing rather than two.
DO $$
DECLARE
    col TEXT;
BEGIN
    FOREACH col IN ARRAY ARRAY[
        'id', 'label', 'kind', 'account_name', 'account_number',
        'qr_image_url', 'instructions', 'display_order', 'is_active', 'created_at'
    ] LOOP
        EXECUTE format('REVOKE SELECT (%I) ON public.payment_accounts FROM anon, authenticated', col);
    END LOOP;
END $$;
