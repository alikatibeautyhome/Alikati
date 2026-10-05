-- ═════════════════════════════════════════════════════════════════════════════
-- Alikati Beauty Home — 0027
--   • a stranger holding the public key cannot write, whether or not RLS slips
-- ═════════════════════════════════════════════════════════════════════════════

-- ── What was wrong ───────────────────────────────────────────────────────────
-- Supabase grants `anon` and `authenticated` nearly everything on every table in `public` by
-- default, and the intent is that Row-Level Security narrows it down. RLS was doing its job — a
-- real test proved it: patching a product's price as `anon` returned zero rows and the price did
-- not move, and deleting it left the row in place. No data was ever exposed.
--
-- But it meant RLS was the *only* thing protecting the data. The public anon key ships in the
-- browser bundle by design, so anyone has it; the entire defence was that every table's policies
-- happened to be correct. One future table created without `ENABLE ROW LEVEL SECURITY`, or one
-- policy written as `USING (true)` where `is_staff()` was meant, and the same key would suddenly
-- be able to write. Defence in depth means the database itself should refuse first.
--
-- ── The split this creates ───────────────────────────────────────────────────
--   anon          → SELECT only, and only where the storefront genuinely needs it.
--   authenticated → read + write as before (the staff console runs as a signed-in user and relies
--                   on RLS plus `is_staff()`), but with the privileges no API can ever use removed.
--
-- Nothing in the application writes as `anon`. Guest checkout, review submission, booking and
-- academy enquiries all go through route handlers that use the service-role key server-side, and
-- the staff console writes as `authenticated`. So nothing loses a capability it was using.
--
-- ── Applied twice on purpose ─────────────────────────────────────────────────
-- Once to every existing table, and once as `ALTER DEFAULT PRIVILEGES` so the next table created
-- in `public` arrives without the write grants too. Fixing only the tables that exist today would
-- leave the same gap waiting for whoever adds the next one.

-- ── §1. Existing tables: drop the write privileges from anon ─────────────────
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
    LOOP
        -- Table-level privileges. SELECT is deliberately left alone: several tables (reviews in
        -- particular) grant it column by column rather than wholesale, and revoking the table
        -- privilege here would not remove those, so the public read path keeps working.
        EXECUTE format(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon',
            t.relname
        );
    END LOOP;
END $$;

-- ── §2. Existing tables: strip the privileges no API can use ─────────────────
-- TRUNCATE is the sharp edge. RLS does **not** apply to it, so a TRUNCATE that reached the
-- database would empty a table regardless of every policy. PostgREST exposes no TRUNCATE verb, so
-- it is not reachable through the REST API today — which makes this cheap insurance against its
-- becoming reachable, not a live hole. REFERENCES and TRIGGER are never needed by either role.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
    LOOP
        EXECUTE format(
            'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated',
            t.relname
        );
    END LOOP;
END $$;

-- ── §3. And for tables that do not exist yet ─────────────────────────────────
-- Without this, the next `create table` gets the Supabase default again and quietly reopens the
-- hole. These apply to tables created later by the role running this migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- ── §4. Sequence access ──────────────────────────────────────────────────────
-- The companion gap: a role that cannot INSERT has no business advancing a sequence, and `anon`
-- could previously call `nextval` on any of them. Every primary key here is a UUID, so this is
-- tidiness rather than a live exposure — but it is the same default-privilege leak.
DO $$
DECLARE
    s RECORD;
BEGIN
    FOR s IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S'
    LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', s.relname);
    END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
