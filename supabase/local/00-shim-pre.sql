-- ═════════════════════════════════════════════════════════════════════════════
-- Supabase environment shim — LOCAL VALIDATION ONLY. Never run against a real project.
--
-- The migrations reference objects that Supabase provides out of the box: the `auth.users`
-- table, `auth.uid()`, the `storage` schema, and the `anon` / `authenticated` / `service_role`
-- roles. A vanilla PostgreSQL instance has none of them, so this file creates just enough of
-- that surface to run the migrations unmodified.
--
-- That makes it possible to verify the schema, the RLS policies and `place_order()` on any
-- machine with Postgres installed — no Docker, no Supabase CLI, no project.
--
--   createdb alikati_test
--   psql -d alikati_test -f supabase/local/00-shim-pre.sql
--   for f in supabase/migrations/*.sql; do psql -d alikati_test -f "$f"; done
--   psql -d alikati_test -f supabase/local/10-functional.sql
--   bash supabase/local/run-local-tests.sh          # everything, from a clean database
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Roles ─────────────────────────────────────────────────────────────────────
-- service_role bypasses RLS, exactly as it does on Supabase.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END $$;

-- ── auth schema ───────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 TEXT UNIQUE,
    encrypted_password    TEXT,
    raw_user_meta_data    JSONB NOT NULL DEFAULT '{}'::jsonb,
    email_confirmed_at    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `auth.uid()` reads the JWT subject from a session setting, which is how Supabase exposes it.
-- Tests impersonate a user with:  SET request.jwt.claim.sub = '<uuid>';
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

-- ── storage schema ────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    public             BOOLEAN NOT NULL DEFAULT FALSE,
    file_size_limit    BIGINT,
    allowed_mime_types TEXT[],
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id   TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    owner       UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- ── Privileges ────────────────────────────────────────────────────────────────
-- Supabase grants broad table privileges to the client roles and relies on RLS to constrain
-- them, so the shim reproduces that — including default privileges, so tables created by the
-- migrations inherit the same grants.
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage
    GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Objects that already exist (the two storage tables above) need an explicit grant.
GRANT ALL ON storage.buckets TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
