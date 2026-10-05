-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0029
--   • rate limits that survive a deploy and count across every instance
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1. What was wrong with the in-memory limiter ────────────────────────────
-- The counter lived in a module-level Map, which is per server instance. Three consequences, in
-- increasing order of seriousness:
--
--   1. A deploy reset every counter to zero — so a script could wait for a release, or simply
--      retry, and start from a clean slate.
--   2. Two instances behind a load balancer each allowed the full quota, so the effective limit
--      was the advertised limit × the number of instances. Serverless platforms scale that number
--      up exactly when traffic is high, which is exactly when the limit matters.
--   3. Every instance carried its own copy of the state, so the memory grew with traffic.
--
-- Postgres is already a dependency. Using it means no Redis to run, pay for, and leak a credential
-- for, and the counter is shared by definition rather than by configuration.

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
    -- The caller plus the route, e.g. 'booking:203.0.113.9'. Text rather than a hash so an
    -- operator can actually read the table when something is being hammered.
    bucket       TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits         INT NOT NULL DEFAULT 0
);

-- Sweeping expired rows needs to find them by age.
CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
    ON public.rate_limit_counters (window_start);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- No policies at all: this table is reachable only through the function below, which is SECURITY
-- DEFINER. Neither anon nor a signed-in user has any business reading who is being rate limited, and
-- a caller who could write it could clear their own counter.
REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated;

-- ── §2. The counter, in one atomic statement ─────────────────────────────────
-- Read-then-write would race: two concurrent requests both read 19, both write 20, and a limit of 20
-- lets 21 through. `INSERT ... ON CONFLICT DO UPDATE` is a single statement, so Postgres serialises
-- it per row and the count is exact under concurrency.
--
-- Returns TRUE when the caller is over the limit. The row is still incremented in that case, which
-- is deliberate — a caller hammering a limit should not be able to freeze their own counter and
-- start again on the next window boundary.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
    p_bucket      TEXT,
    p_limit       INT,
    p_window_secs INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hits INT;
BEGIN
    IF p_limit <= 0 THEN
        -- A limit of zero means "refuse everything", which is a legitimate way to switch an
        -- endpoint off without a deploy.
        RETURN TRUE;
    END IF;

    INSERT INTO public.rate_limit_counters AS c (bucket, window_start, hits)
    VALUES (p_bucket, now(), 1)
    ON CONFLICT (bucket) DO UPDATE
        SET hits = CASE
                       -- Past the window: start a fresh count rather than accumulating forever.
                       WHEN c.window_start < now() - make_interval(secs => p_window_secs)
                       THEN 1
                       ELSE c.hits + 1
                   END,
            window_start = CASE
                               WHEN c.window_start < now() - make_interval(secs => p_window_secs)
                               THEN now()
                               ELSE c.window_start
                           END
    RETURNING hits INTO v_hits;

    RETURN v_hits > p_limit;
END $$;

-- The API routes call this with the service role, so anonymous callers never reach it. Revoking
-- from PUBLIC keeps it off the PostgREST surface entirely.
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;

-- ── §3. Housekeeping ─────────────────────────────────────────────────────────
-- Rows are only interesting for as long as their window, so old ones are pruned opportunistically
-- from inside the function rather than by a scheduled job — there is no scheduler here, and pg_cron
-- is not enabled. The probability of pruning is low so the cost is spread rather than paid on one
-- unlucky request.
CREATE OR REPLACE FUNCTION public.rate_limit_sweep(p_older_than_secs INT DEFAULT 3600)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM public.rate_limit_counters
    WHERE window_start < now() - make_interval(secs => p_older_than_secs);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.rate_limit_sweep(INT) FROM PUBLIC, anon, authenticated;
