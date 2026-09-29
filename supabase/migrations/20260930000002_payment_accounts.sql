-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0020
--   • the shop can take money into more than one account
--   • each account carries its own QR, name and number
--   • the single QR from 0011 is carried over, not dropped
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why a table and not more columns ─────────────────────────────────────
-- 0011 put exactly one QR on the shop: `salon_settings.payment_qr_image_url` plus a
-- `payment_qr_content` string to encode. That is one destination. A shop that banks with Nabil and
-- also accepts Khalti and eSewa has three, each with its own QR exported from its own app, and the
-- owner needs to add or retire one without a developer.
--
-- Three more `payment_qr_*_2` columns would have been the other way to do it, and it is the wrong
-- one: the number of accounts is genuinely open-ended, and every consumer of the settings row would
-- have had to learn about `_2`, `_3`, `_4`. A child table keeps `salon_settings` a settings row.
--
-- The old columns stay in place and stay populated. Nothing here drops them: `PaymentQR` still
-- reads them as the fallback for a shop that has not created any account rows yet, and a rollback
-- that happened to precede this migration must still find the owner's QR where it left it.
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What the customer sees as the option, e.g. "Nabil Bank" or "Khalti".
    label          VARCHAR(80) NOT NULL,

    -- How it is grouped at checkout. Deliberately a small closed set: this drives which icon and
    -- which label the customer sees, and a free-text field here would produce a different set of
    -- groupings every time the owner typed a new one.
    kind           VARCHAR(20) NOT NULL DEFAULT 'bank',

    -- Account holder or merchant name, as it should appear on a receipt.
    account_name   VARCHAR(120),

    -- Account, mobile or merchant number. Shown in full: this is the whole point of the row, and
    -- the customer has to be able to check they are paying the right account.
    account_number VARCHAR(60),

    -- The QR the customer scans. Exported from the provider's own app and uploaded in admin, which
    -- is why it is a stored image rather than something generated here — the provider decides what
    -- its own QR encodes.
    qr_image_url   TEXT,

    -- Anything the owner wants printed under this option, e.g. "Send a screenshot to confirm".
    instructions   TEXT,

    display_order  INT NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- A blank label is treated as absent rather than rejected, so a form posting `""` for an
    -- untouched field cannot fail the insert with a confusing constraint error.
    CONSTRAINT payment_accounts_label_present CHECK (char_length(btrim(label)) > 0),
    CONSTRAINT payment_accounts_kind_known CHECK (kind IN ('bank', 'wallet', 'other'))
);

COMMENT ON TABLE  public.payment_accounts IS
    'One row per payment destination the shop accepts (bank, wallet or other), each with its own QR.';
COMMENT ON COLUMN public.payment_accounts.kind IS
    'Grouping shown at checkout: bank, wallet or other.';
COMMENT ON COLUMN public.payment_accounts.qr_image_url IS
    'Public URL of the QR image exported from the provider app. NULL renders no QR for this account.';

-- Checkout asks for the active set in display order on every render, so the index matches the
-- query rather than the primary key.
CREATE INDEX IF NOT EXISTS payment_accounts_active_order_idx
    ON public.payment_accounts (is_active, display_order);

DROP TRIGGER IF EXISTS payment_accounts_touch_updated_at ON public.payment_accounts;
CREATE TRIGGER payment_accounts_touch_updated_at
    BEFORE UPDATE ON public.payment_accounts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── §2. Access ───────────────────────────────────────────────────────────────
-- The checkout page is public — a visitor must be able to see where to send money before they have
-- an account — so the active rows are world-readable. Everything a customer needs to pay is here by
-- design: this table holds no secret, only the shop's own published account numbers.
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON public.payment_accounts FROM anon, authenticated;
GRANT SELECT (id, label, kind, account_name, account_number, qr_image_url, instructions,
              display_order, is_active, created_at)
    ON public.payment_accounts TO anon, authenticated;

DROP POLICY IF EXISTS "payment_accounts_public_read" ON public.payment_accounts;
CREATE POLICY "payment_accounts_public_read" ON public.payment_accounts
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

-- Staff see the retired ones too, so a disabled account can be edited back on rather than being
-- invisible and therefore unreachable.
DROP POLICY IF EXISTS "payment_accounts_staff_read" ON public.payment_accounts;
CREATE POLICY "payment_accounts_staff_read" ON public.payment_accounts
    FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "payment_accounts_staff_insert" ON public.payment_accounts;
CREATE POLICY "payment_accounts_staff_insert" ON public.payment_accounts
    FOR INSERT WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "payment_accounts_staff_update" ON public.payment_accounts;
CREATE POLICY "payment_accounts_staff_update" ON public.payment_accounts
    FOR UPDATE USING (public.is_staff())
    WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "payment_accounts_admin_delete" ON public.payment_accounts;
CREATE POLICY "payment_accounts_admin_delete" ON public.payment_accounts
    FOR DELETE USING (public.is_admin());

-- ── §3. Carry the existing QR across ─────────────────────────────────────────
-- The shop already has one working destination configured in `salon_settings`. Without this the
-- owner would sign in to find an empty list and conclude their QR had been deleted, so a single row
-- is seeded from it — but only when there is something to seed, and only when the table is empty,
-- so re-running the migration can never duplicate it.
INSERT INTO public.payment_accounts (label, kind, account_name, account_number, qr_image_url, instructions, display_order)
SELECT
    'eSewa',
    'wallet',
    'Alikati Beauty Home',
    -- `esewa:9869512756?amount={amount}` → `9869512756`. NULL when the content is not in that form.
    NULLIF(split_part(split_part(s.settings_content, ':', 2), '?', 1), ''),
    s.settings_image,
    'Scan the QR to pay, then upload your payment screenshot at checkout.',
    0
FROM (
    SELECT
        NULLIF(btrim(COALESCE(payment_qr_content, '')), '')     AS settings_content,
        NULLIF(btrim(COALESCE(payment_qr_image_url, '')), '')   AS settings_image
    FROM public.salon_settings
    WHERE id = 1
) AS s
WHERE (s.settings_content IS NOT NULL OR s.settings_image IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.payment_accounts);
