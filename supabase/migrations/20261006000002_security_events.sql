-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0028
--   • an append-only record of who did what in the console
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why this table exists ────────────────────────────────────────────────
-- The console can read every customer's name, phone number and address, change prices and orders,
-- and create other staff accounts. Until now none of that left a trace: the only evidence of a
-- misused account was whatever the tables happened to look like afterwards.
--
-- That has two costs. The obvious one is detection — "review the logs for anomalies" is impossible
-- with no logs. The subtler one is attribution. When three people share a console, a wrong price or
-- a deleted order is an argument rather than a fact. This makes it a fact.
--
-- ── §2. Append-only, and enforced rather than intended ───────────────────────
-- A log that can be edited is not evidence. UPDATE and DELETE are revoked from every role, and a
-- trigger rejects them even for the service role — belt and braces, because the service role is
-- exactly what a script would use to cover its tracks. Rows are only ever added.
--
-- There is deliberately no `updated_at` and no soft-delete column: a corrected entry is a new entry.

CREATE TABLE IF NOT EXISTS public.security_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Who. Nullable because some events are attributable to nobody in particular (a failed sign-in
    -- has no authenticated user); the email is denormalised on purpose so the record still reads
    -- correctly after an account is deleted.
    actor_id     UUID,
    actor_email  TEXT,

    -- What. `action` is a dotted verb ('staff.created', 'mfa.enrolled'); `entity` names what it
    -- happened to. Kept as text rather than enums so adding an action never needs a migration.
    action       TEXT NOT NULL,
    entity       TEXT,
    entity_id    TEXT,
    summary      TEXT NOT NULL,

    -- Anything extra worth keeping (old and new values, a reason). Bounded on write, not here.
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Where from. Useful for spotting a session being used from somewhere unexpected.
    ip           TEXT
);

-- The console reads newest-first, so the index matches the only query that matters.
CREATE INDEX IF NOT EXISTS security_events_created_at_idx
    ON public.security_events (created_at DESC);

-- "What has this account been doing?" is the other question worth asking quickly.
CREATE INDEX IF NOT EXISTS security_events_actor_idx
    ON public.security_events (actor_id, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- ── §3. Append-only, enforced ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.security_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Even the service role is refused. If an attacker's script already holds that key, the log it
    -- came to erase should not be erasable.
    RAISE EXCEPTION 'security_events is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS security_events_no_update ON public.security_events;
CREATE TRIGGER security_events_no_update
    BEFORE UPDATE OR DELETE ON public.security_events
    FOR EACH ROW EXECUTE FUNCTION public.security_events_append_only();

-- ── §4. Who may read, and who may write ──────────────────────────────────────
-- Read: staff only. The log names accounts and describes what they did, so it is not public and
-- not visible to a signed-in customer.
DROP POLICY IF EXISTS security_events_staff_read ON public.security_events;
CREATE POLICY security_events_staff_read ON public.security_events
    FOR SELECT TO authenticated
    USING (public.is_staff());

-- No INSERT policy at all. Rows arrive either through the service role (which bypasses RLS and is
-- used by the API routes) or through the function below.
DROP POLICY IF EXISTS security_events_no_client_write ON public.security_events;
CREATE POLICY security_events_no_client_write ON public.security_events
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- Migration 0027 already revoked anon's write grants and set ALTER DEFAULT PRIVILEGES, so this
-- table arrives without them. The explicit revokes below are for the privileges 0027 could not
-- know about: UPDATE and DELETE are never needed here by anyone.
REVOKE UPDATE, DELETE, TRUNCATE ON public.security_events FROM anon, authenticated;

-- ── §5. The one way a browser may write an entry ─────────────────────────────
-- MFA enrolment happens entirely in the browser through supabase-js, so something client-callable
-- has to record it. This function is that, and it takes the actor **from the session** rather than
-- from its arguments — which is the whole point. A client can say what happened; it cannot say
-- *who* did it, so it cannot forge an entry against another account.
--
-- SECURITY DEFINER so it can insert past the `false` policy above, with a pinned search_path so
-- the definer's privileges cannot be redirected at another schema.
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_action   TEXT,
    p_summary  TEXT,
    p_entity   TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_id    UUID;
    v_uid   UUID := auth.uid();
    v_email TEXT;
    v_len   INT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'log_security_event requires an authenticated session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Only staff may write to the log. Without this a signed-in customer could fill the console's
    -- audit view with noise, which is a cheap way to hide a real entry.
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'log_security_event is restricted to staff'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Bound the inputs. An audit trail is read by humans in a table, so an unbounded summary is a
    -- way to make the viewer unusable rather than a way to break anything.
    v_len := length(coalesce(p_summary, ''));
    IF v_len = 0 OR v_len > 500 THEN
        RAISE EXCEPTION 'summary must be between 1 and 500 characters'
            USING ERRCODE = 'check_violation';
    END IF;
    IF length(coalesce(p_action, '')) = 0 OR length(p_action) > 80 THEN
        RAISE EXCEPTION 'action must be between 1 and 80 characters'
            USING ERRCODE = 'check_violation';
    END IF;
    IF pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 4096 THEN
        RAISE EXCEPTION 'metadata must be under 4 kB'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    INSERT INTO public.security_events (actor_id, actor_email, action, entity, entity_id, summary, metadata)
    VALUES (v_uid, v_email, p_action, p_entity, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_id;

    RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ── §6. A convenience the console needs ──────────────────────────────────────
-- The viewer shows a trailing window and wants the count, which is far cheaper as one aggregate
-- than by fetching and counting rows client-side.
CREATE OR REPLACE VIEW public.v_recent_security_events
WITH (security_invoker = true)
AS
SELECT id, created_at, actor_id, actor_email, action, entity, entity_id, summary, metadata, ip
FROM public.security_events
ORDER BY created_at DESC
LIMIT 500;

GRANT SELECT ON public.v_recent_security_events TO authenticated;
