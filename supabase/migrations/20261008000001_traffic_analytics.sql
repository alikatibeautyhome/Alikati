-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0031
--   • first-party traffic analytics: what the storefront is actually serving
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. Why this table exists ────────────────────────────────────────────────
-- Until now the console could tell us how many orders were placed and how many appointments were
-- booked, but nothing about the people who arrived and left without doing either. Two questions
-- were unanswerable: which pages are actually seen, and where the visitors come from. Those are
-- the two questions that decide where the next hour of work goes.
--
-- This is deliberately *first-party*. No third-party script, no external account, no data leaving
-- the building — which matters more than usual here because the same app carries a cookie notice
-- that promises exactly that for visitors who choose "essential only" (see §5).

-- ── §2. What one row is, and what is deliberately absent ─────────────────────
-- One row is one page view.
--
-- There is no IP address column, no raw user-agent string, and no cookie id. What is stored is the
-- *derived* answer to a question ("phone or desktop?", "search or social?") plus a visitor hash
-- that cannot be walked back to an address:
--
--   visitor_hash = sha256(ip | user-agent | YYYY-MM-DD | server secret)
--
-- It is computed in the API route, never here, so the secret is not in the database and a dump of
-- this table cannot be brute-forced back to an IP. It rotates daily: the same person gets a
-- different hash tomorrow, so "unique visitors" is a per-day figure and no long-lived profile of
-- an individual accumulates. `session_id` is a random value minted by the browser tab and kept in
-- sessionStorage, so it dies with the tab and is not a tracking cookie.
--
-- That combination is what makes this defensible: the table can answer "how many people looked at
-- the shop page on Tuesday" and cannot answer "what did this person look at".

-- ── §3. The table ────────────────────────────────────────────────────────────
-- BIGSERIAL rather than UUID for the key. Every other table here uses a UUID because its id is
-- exposed in a URL or an API response; nothing ever sees this one, and it is the highest-volume
-- table in the schema, so an 8-byte counter beats a 16-byte random value.
CREATE TABLE IF NOT EXISTS public.traffic_events (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The path only: query string and hash are stripped before the row is written, so `?ref=` and
    -- similar never land here in a form that could carry an identifier.
    path          TEXT NOT NULL,

    -- How they arrived. `source` is the coarse bucket the console groups by ('direct', 'search',
    -- 'social', 'referral', 'affiliate'); `source_detail` names the specific one ('google',
    -- 'facebook', 'ref:SPRING10'). Kept as text rather than an enum so adding a source never needs
    -- a migration — the same reasoning as security_events.action.
    source        TEXT NOT NULL DEFAULT 'direct',
    source_detail TEXT,
    referrer_host TEXT,

    device        TEXT NOT NULL DEFAULT 'unknown',
    browser       TEXT,
    os            TEXT,
    country       TEXT,

    session_id    TEXT,
    visitor_hash  TEXT NOT NULL,
    is_bot        BOOLEAN NOT NULL DEFAULT false
);

-- Bound every free-text column. An unconstrained text column written by an unauthenticated endpoint
-- is a way to make this table unreadable rather than a way to break anything. The limits are
-- generous enough that a legitimate value never hits them.
ALTER TABLE public.traffic_events
    DROP CONSTRAINT IF EXISTS traffic_events_bounds;
ALTER TABLE public.traffic_events
    ADD CONSTRAINT traffic_events_bounds CHECK (
        length(path) BETWEEN 1 AND 512
        AND length(source) BETWEEN 1 AND 32
        AND (source_detail IS NULL OR length(source_detail) <= 64)
        AND (referrer_host IS NULL OR length(referrer_host) <= 255)
        AND length(device) <= 16
        AND (browser IS NULL OR length(browser) <= 32)
        AND (os IS NULL OR length(os) <= 32)
        AND (country IS NULL OR length(country) = 2)
        AND (session_id IS NULL OR length(session_id) <= 64)
        AND length(visitor_hash) = 64
    );

-- ── §4. Indexes ──────────────────────────────────────────────────────────────
-- Every query the console runs is "over the last N days", so the window is the index that matters.
CREATE INDEX IF NOT EXISTS traffic_events_created_at_idx
    ON public.traffic_events (created_at DESC);

-- "Which pages are seen" and "where from" are the two breakdowns, each scoped to a window.
CREATE INDEX IF NOT EXISTS traffic_events_path_idx
    ON public.traffic_events (path, created_at DESC);
CREATE INDEX IF NOT EXISTS traffic_events_source_idx
    ON public.traffic_events (source, created_at DESC);

-- Bounce rate counts views per session, so it groups by this. Partial: rows without a session id
-- cannot contribute to a bounce and there is no reason to carry them in the index.
CREATE INDEX IF NOT EXISTS traffic_events_session_idx
    ON public.traffic_events (session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- ── §5. Who may write, who may read ──────────────────────────────────────────
ALTER TABLE public.traffic_events ENABLE ROW LEVEL SECURITY;

-- Staff read the numbers. A signed-in customer — and `anon` — get nothing.
DROP POLICY IF EXISTS traffic_events_staff_read ON public.traffic_events;
CREATE POLICY traffic_events_staff_read ON public.traffic_events
    FOR SELECT TO authenticated
    USING (public.is_staff());

-- No INSERT policy for anyone. Rows arrive through the service role from `/api/traffic` (which
-- bypasses RLS), never from a browser. This matters: the endpoint is unauthenticated by nature, so
-- the only thing standing between it and an open write API is the route's own validation and rate
-- limit. Letting an arbitrary client insert directly would route around both.
DROP POLICY IF EXISTS traffic_events_no_client_write ON public.traffic_events;
CREATE POLICY traffic_events_no_client_write ON public.traffic_events
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- Nothing ever updates or deletes a page view. Correction happens by pruning the window (§7).
REVOKE UPDATE, DELETE, TRUNCATE ON public.traffic_events FROM anon, authenticated;
REVOKE INSERT ON public.traffic_events FROM anon, authenticated;

-- ── §6. What the console reads ───────────────────────────────────────────────
-- These are SECURITY INVOKER (the default), which is the point: Row-Level Security on the table
-- above decides the answer. A non-staff caller gets zero rows from a function that returns
-- aggregates rather than an error, which is both quieter and safe.
--
-- Bots are excluded here rather than at write time. Recording them keeps the raw table honest —
-- if a crawler ever floods the site we can see it — while the console stays legible.
--
-- Days are bucketed in Asia/Kathmandu, not UTC. A "day" in the console should mean a day the
-- salon was open, and at UTC+05:45 a UTC bucket would split the evening across two days.

-- Headline figures for the window.
CREATE OR REPLACE FUNCTION public.traffic_summary(p_days INT DEFAULT 30)
RETURNS TABLE (
    views    BIGINT,
    visitors BIGINT,
    sessions BIGINT,
    bounces  BIGINT
)
LANGUAGE sql
STABLE
AS $$
    WITH windowed AS (
        SELECT session_id, visitor_hash
        FROM public.traffic_events
        WHERE NOT is_bot
          AND created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
    ),
    per_session AS (
        SELECT session_id, count(*) AS n
        FROM windowed
        WHERE session_id IS NOT NULL
        GROUP BY session_id
    )
    SELECT
        (SELECT count(*) FROM windowed)                        AS views,
        (SELECT count(DISTINCT visitor_hash) FROM windowed)    AS visitors,
        (SELECT count(*) FROM per_session)                     AS sessions,
        (SELECT count(*) FROM per_session WHERE n = 1)         AS bounces;
$$;

-- One row per day, with empty days filled in. The series is generated first and the events are
-- joined onto it, because a gap in a chart should read as "nobody came" rather than as a day that
-- silently does not exist — the line would otherwise connect Tuesday straight to Friday.
CREATE OR REPLACE FUNCTION public.traffic_daily(p_days INT DEFAULT 30)
RETURNS TABLE (
    day      DATE,
    views    BIGINT,
    visitors BIGINT,
    sessions BIGINT
)
LANGUAGE sql
STABLE
AS $$
    WITH bounds AS (
        SELECT (now() AT TIME ZONE 'Asia/Kathmandu')::date
                 - (greatest(1, least(p_days, 365)) - 1) AS start_day,
               (now() AT TIME ZONE 'Asia/Kathmandu')::date AS end_day
    ),
    days AS (
        SELECT generate_series(b.start_day, b.end_day, interval '1 day')::date AS day
        FROM bounds b
    )
    SELECT
        d.day,
        count(e.id)                        AS views,
        count(DISTINCT e.visitor_hash)     AS visitors,
        count(DISTINCT e.session_id)       AS sessions
    FROM days d
    LEFT JOIN public.traffic_events e
           ON (e.created_at AT TIME ZONE 'Asia/Kathmandu')::date = d.day
          AND NOT e.is_bot
    GROUP BY d.day
    ORDER BY d.day;
$$;

-- Top pages, sources, devices or countries — one function rather than four near-identical ones.
-- `p_dimension` is matched with CASE so the query stays a single grouped scan; an unknown value
-- falls back to 'path' rather than raising, because this is called from a query string.
CREATE OR REPLACE FUNCTION public.traffic_breakdown(
    p_days      INT DEFAULT 30,
    p_dimension TEXT DEFAULT 'path',
    p_limit     INT DEFAULT 12
)
RETURNS TABLE (
    label    TEXT,
    detail   TEXT,
    views    BIGINT,
    visitors BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        CASE p_dimension
            WHEN 'source'  THEN t.source
            WHEN 'device'  THEN t.device
            WHEN 'country' THEN coalesce(t.country, 'XX')
            WHEN 'browser' THEN coalesce(t.browser, 'unknown')
            ELSE t.path
        END AS label,
        -- Only the source breakdown has a second level worth showing.
        CASE WHEN p_dimension = 'source' THEN max(t.source_detail) ELSE NULL END AS detail,
        count(*)                    AS views,
        count(DISTINCT t.visitor_hash) AS visitors
    FROM public.traffic_events t
    WHERE NOT t.is_bot
      AND t.created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
    GROUP BY 1
    ORDER BY views DESC
    LIMIT greatest(1, least(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.traffic_summary(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_daily(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_breakdown(INT, TEXT, INT) TO authenticated;

-- ── §7. Retention ────────────────────────────────────────────────────────────
-- The table grows by one row per page view and nothing reads it beyond a year. Left alone it is
-- the largest table in the schema within a few months, which is a slow way to make the whole
-- database slower.
--
-- This is SECURITY DEFINER and revoked from every client role: it deletes rows in bulk, so it is
-- maintenance, not something a signed-in staff member should be able to trigger. Call it from
-- Supabase's scheduler (pg_cron) on a daily job:
--
--   select cron.schedule('traffic-prune', '30 3 * * *',
--                        $$select public.traffic_prune(400)$$);
--
-- 400 days keeps a full year-over-year comparison possible while capping the table.
CREATE OR REPLACE FUNCTION public.traffic_prune(p_keep_days INT DEFAULT 400)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted BIGINT;
BEGIN
    IF p_keep_days < 30 THEN
        RAISE EXCEPTION 'refusing to prune below 30 days of history (asked to keep %)', p_keep_days
            USING ERRCODE = 'check_violation';
    END IF;

    DELETE FROM public.traffic_events
    WHERE created_at < now() - make_interval(days => p_keep_days);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.traffic_prune(INT) FROM PUBLIC, anon, authenticated;
