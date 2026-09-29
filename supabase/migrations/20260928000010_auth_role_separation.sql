-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0010: CRITICAL — separate customer signups from staff access
--
-- THE BUG THIS FIXES
-- ------------------
-- `handle_new_staff_user()` (0001) fires on EVERY row inserted into `auth.users` and
-- unconditionally created a `profiles` row with role `staff`:
--
--     CASE WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin' ELSE 'staff' END
--
-- Customer signups also insert into `auth.users`, so every person who registered at
-- /account/signup was given role `staff`. `is_staff()` — which every RLS policy for orders,
-- appointments, customers, coupons, products and services keys off — then returned TRUE for
-- them. Verified against a real database before this fix:
--
--     customer signup → role "staff"
--     → SELECT count(*) FROM orders      → 2   (names, phones, delivery addresses)
--     → SELECT count(*) FROM customers   → 1
--     → UPDATE products SET price_npr=1  → SUCCEEDED
--
-- Anyone could self-register and take over the storefront. No data was at risk in practice
-- because the project had not been deployed yet — but `supabase db push` would have shipped
-- this. Found by supabase/local/run-local-tests.sh.
--
-- THE FIX
-- -------
-- A profile is now provisioned ONLY when the signup explicitly declares a staff role in its
-- user metadata (`role: 'admin' | 'staff'`). `scripts/create-admin.mjs` already sets
-- `user_metadata: { full_name, role: 'admin' }`, so admin creation is unaffected.
--
-- ⚠ IMPORTANT FOR STAFF INVITATIONS: inviting a staff member from the Supabase dashboard
--   without adding a `role` key to their user metadata will NOT create a profile, and they
--   will be unable to sign in to the console. Either use scripts/create-admin.mjs, or add
--     { "role": "staff" }
--   to the user's metadata in the dashboard and re-save.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Staff profiles require an explicit staff invitation ────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := COALESCE(NEW.raw_user_meta_data->>'role', '');
BEGIN
    -- No `role` claim means this is a customer signup, not staff. Do nothing at all.
    IF v_role NOT IN ('admin', 'staff') THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Staff Member'),
        CASE WHEN v_role = 'admin' THEN 'admin' ELSE 'staff' END
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ── 2. Staff are not customers ────────────────────────────────────────────────
-- Symmetry: a user who declared a staff role should not also land in the customer list.
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Customer accounts are email-based; ignore anything else (e.g. phone-only users).
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Staff invitations are not customers.
    IF COALESCE(NEW.raw_user_meta_data->>'role', '') IN ('admin', 'staff') THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.customers (id, email, full_name, phone, marketing_opt_in)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Customer'),
        NULLIF(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, FALSE)
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ── 3. Remove profiles wrongly created by the old trigger ─────────────────────
-- Scoped deliberately narrowly: only rows that are BOTH a customer and a non-invited
-- `staff` profile are removed. Someone genuinely invited as staff is left untouched, and an
-- admin is never touched.
DELETE FROM public.profiles p
USING public.customers c
WHERE p.id = c.id
  AND p.role = 'staff'
  AND COALESCE(
        (SELECT u.raw_user_meta_data->>'role' FROM auth.users u WHERE u.id = p.id),
        ''
      ) NOT IN ('admin', 'staff');

-- ── 4. Prove it ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_customer UUID := gen_random_uuid();
    v_staff    UUID := gen_random_uuid();
BEGIN
    -- A public customer signup: no role claim.
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_customer, 'role-separation-customer@example.com', '{"full_name":"Real Customer"}'::jsonb);

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_customer) THEN
        RAISE EXCEPTION 'SECURITY: a customer signup was given a staff profile';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer) THEN
        RAISE EXCEPTION 'a customer signup did not get a customer row';
    END IF;
    RAISE NOTICE 'L1  customer signup → customer row only, no staff profile';

    -- A staff invitation: explicit role claim.
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_staff, 'role-separation-staff@example.com',
            '{"full_name":"Real Staff","role":"staff"}'::jsonb);

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_staff AND role = 'staff') THEN
        RAISE EXCEPTION 'a staff invitation did not create a staff profile';
    END IF;
    IF EXISTS (SELECT 1 FROM public.customers WHERE id = v_staff) THEN
        RAISE EXCEPTION 'a staff member was also created as a customer';
    END IF;
    RAISE NOTICE 'L2  staff invitation → staff profile only, not a customer';

    -- And confirm the escalation is closed: the customer cannot read the order book.
    PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
    IF public.is_staff() THEN
        RAISE EXCEPTION 'SECURITY: is_staff() is still true for a customer';
    END IF;
    RAISE NOTICE 'L3  is_staff() is false for a customer account';

    -- Tidy up the probe rows so the database is left as we found it.
    DELETE FROM public.customers WHERE id = v_customer;
    DELETE FROM public.profiles WHERE id IN (v_customer, v_staff);
    DELETE FROM auth.users WHERE id IN (v_customer, v_staff);
END $$;
