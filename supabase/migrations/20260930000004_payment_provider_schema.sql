-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0022
--   • a payment account is identified by its provider, not a free-form label
--   • bank destinations carry a bank name and branch
--   • the checkout can group accounts into eSewa / Khalti / Bank Transfer tabs
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. `kind` becomes `provider`, with the provider's own names ─────────────
-- 0020 modelled the grouping as bank / wallet / other. That is the wrong axis: the customer picks
-- *eSewa* or *Khalti* or their bank, and "wallet" is a category an owner would have to translate in
-- their head twice — once when adding the account and again when reading the checkout. Renaming to
-- the providers the shop actually uses lets the checkout render a tab per provider without a
-- mapping table, and lets the admin form offer the real choices.
ALTER TABLE public.payment_accounts DROP CONSTRAINT IF EXISTS payment_accounts_kind_known;
ALTER TABLE public.payment_accounts RENAME COLUMN kind TO provider;

-- Map the old vocabulary onto the new one before the constraint is reapplied, so the migration fails
-- loudly here if a value does not fit rather than silently leaving an unconstrained column.
UPDATE public.payment_accounts
SET provider = CASE
    WHEN label ILIKE '%esewa%'  THEN 'esewa'
    WHEN label ILIKE '%khalti%' THEN 'khalti'
    WHEN label ILIKE '%bank%'   THEN 'bank'
    ELSE 'other'
END
WHERE provider = 'wallet';

UPDATE public.payment_accounts SET provider = 'other' WHERE provider NOT IN ('esewa', 'khalti', 'bank', 'other');

ALTER TABLE public.payment_accounts
    ADD CONSTRAINT payment_accounts_provider_known
    CHECK (provider IN ('esewa', 'khalti', 'bank', 'other'));

COMMENT ON COLUMN public.payment_accounts.provider IS
    'Which service the money goes to: esewa, khalti, bank or other. Drives the checkout tab.';

-- ── §2. Bank details, and a clearer name for the number ─────────────────────
-- "Account number" was wrong for a wallet, where the same field holds a mobile number.
ALTER TABLE public.payment_accounts RENAME COLUMN account_number TO account_identifier;

ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS bank_name   TEXT,
    ADD COLUMN IF NOT EXISTS bank_branch TEXT;

COMMENT ON COLUMN public.payment_accounts.account_identifier IS
    'Wallet/mobile number, or the bank account number.';
COMMENT ON COLUMN public.payment_accounts.bank_name IS
    'Bank only. NULL for wallets.';

-- The free-form `label` existed to name an account before the provider did that job ("Nmb"). That
-- information belongs in `bank_name`, so it is moved there rather than dropped — these rows are
-- real configurations, and losing the bank's name would leave the owner with an unnamed account.
UPDATE public.payment_accounts
SET bank_name = COALESCE(bank_name, NULLIF(btrim(label), ''))
WHERE provider = 'bank' AND bank_name IS NULL;

-- New accounts are named by their provider, so `label` is no longer required and the old
-- "must not be blank" rule would reject an insert that legitimately omits it.
ALTER TABLE public.payment_accounts ALTER COLUMN label DROP NOT NULL;
ALTER TABLE public.payment_accounts DROP CONSTRAINT IF EXISTS payment_accounts_label_present;

COMMENT ON COLUMN public.payment_accounts.label IS
    'Optional display override. When NULL the checkout names the account after its provider.';

-- ── §3. Keep the read path working ───────────────────────────────────────────
-- Renaming a column drops nothing here: 0021 granted SELECT on the whole table, so the new columns
-- are readable without another grant. Recorded explicitly because the opposite assumption (a
-- column list) is exactly what broke the checkout in 0020.
GRANT SELECT ON public.payment_accounts TO anon, authenticated;
