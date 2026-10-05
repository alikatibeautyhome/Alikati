import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A deployment self-check.
 *
 * Open `/api/health` on a deployment to find out what is actually wrong with it. This exists because
 * "the site has Supabase errors" is not something anyone can act on: the useful answer is a specific
 * list — which variable is missing, which migration has not been applied, whether the database is
 * reachable at all — and that answer is only obtainable where the deployment is running.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────
 *  • It never returns the value of a secret, only whether one is present. A `true`/`false` is
 *    diagnostic; the key itself would be a leak, and health endpoints are routinely unauthenticated.
 *  • It never passes through a raw database or library error. Those name hosts, tables and query
 *    fragments — useful to an attacker, and only marginally useful to an operator who has this
 *    endpoint's own hints. The server log keeps the detail.
 *  • It does not touch customer data. Every probe reads a row that exists to prove reachability, or
 *    asks the catalogue whether a function is defined.
 *
 * Returns 200 when everything required works, 503 when something required does not. A warning
 * (something unset that has a working fallback) does not fail the check.
 */

type Status = 'ok' | 'warn' | 'fail';

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Tables and functions the application calls. Missing ones mean migrations were not applied. */
const REQUIRED_FUNCTIONS = [
  'is_staff',
  'place_order',
  'delivery_fee_for',
  'rate_limit_hit',
  'log_security_event',
] as const;

const REQUIRED_TABLES = [
  'products',
  'product_categories',
  'orders',
  'order_items',
  'customers',
  'profiles',
  'salon_settings',
  'payment_accounts',
  'security_events',
  'rate_limit_counters',
] as const;

const REQUIRED_BUCKETS = ['gallery', 'payment-proofs'] as const;

export async function GET(): Promise<NextResponse> {
  const checks: Check[] = [];

  // ── 1. Configuration ───────────────────────────────────────────────────────
  for (const key of REQUIRED_ENV) {
    const present = Boolean(process.env[key]);
    checks.push({
      name: `env: ${key}`,
      status: present ? 'ok' : 'fail',
      detail: present
        ? 'set'
        : 'missing — add it in the hosting dashboard and redeploy (a redeploy is required; changing a variable does not restart a running deployment)',
    });
  }

  /*
    Not required, because the code falls back to the production domain. But if it is set to a
    temporary host — a preview URL, a tunnel — the sitemap and every Open Graph tag advertise that
    host instead, which is worth surfacing rather than discovering in a search result.
  */
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  checks.push({
    name: 'env: NEXT_PUBLIC_SITE_URL',
    status: siteUrl ? 'ok' : 'warn',
    detail: siteUrl
      ? `set to ${siteUrl}`
      : 'not set — falling back to https://alikatibeautyhome.com for the sitemap and Open Graph tags. Set it if this deployment serves a different domain.',
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── 2. Database reachability ───────────────────────────────────────────────
  if (!url || !service) {
    checks.push({
      name: 'database',
      status: 'fail',
      detail: 'cannot be tested until the Supabase variables above are set',
    });
  } else {
    const base = url.replace(/\/$/, '');
    const headers = { apikey: service, Authorization: `Bearer ${service}`, Accept: 'application/json' };

    let reachable = false;
    try {
      const res = await fetch(`${base}/rest/v1/salon_settings?select=id&limit=1`, {
        headers,
        cache: 'no-store',
      });
      reachable = res.ok;
      checks.push({
        name: 'database reachable',
        status: reachable ? 'ok' : 'fail',
        detail: reachable
          ? 'connected'
          : `the REST endpoint answered ${res.status} — check the project URL and that the service-role key belongs to it`,
      });
    } catch {
      checks.push({
        name: 'database reachable',
        status: 'fail',
        detail:
          'the request failed entirely — usually a wrong or truncated project URL, or the project is paused',
      });
    }

    if (reachable) {
      /*
        One call answers "are the migrations applied here?".

        The first version probed each function by POSTing to `/rest/v1/rpc/<name>` with an empty body
        and read a 404 as "missing" — which reported four functions as absent that were provably
        present, because PostgREST also 404s on a signature mismatch. A diagnostic that sends an
        operator after a problem that does not exist is worse than none. `health_check()` reads
        `pg_proc` and `information_schema` directly, so it cannot be fooled by argument shapes.
      */
      try {
        const res = await fetch(`${base}/rest/v1/rpc/health_check`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
          cache: 'no-store',
        });

        if (res.status === 404) {
          checks.push({
            name: 'migrations',
            status: 'fail',
            detail:
              'the health_check() function itself is missing, which means the migrations have not been applied to this project. Run supabase/apply-all.sql against it.',
          });
        } else if (!res.ok) {
          checks.push({
            name: 'migrations',
            status: 'fail',
            detail: `could not determine the migration state (HTTP ${res.status})`,
          });
        } else {
          const report = (await res.json()) as {
            missing_tables?: string[];
            missing_functions?: string[];
            missing_buckets?: string[];
            tables_without_rls?: string[];
          };

          const tables = report.missing_tables ?? [];
          const functions = report.missing_functions ?? [];
          const buckets = report.missing_buckets ?? [];
          const noRls = report.tables_without_rls ?? [];

          checks.push({
            name: 'tables',
            status: tables.length ? 'fail' : 'ok',
            detail: tables.length
              ? `missing: ${tables.join(', ')} — apply supabase/apply-all.sql to this project`
              : `all ${REQUIRED_TABLES.length} required tables present`,
          });

          checks.push({
            name: 'database functions',
            status: functions.length ? 'fail' : 'ok',
            detail: functions.length
              ? `missing: ${functions.join(', ')} — apply supabase/apply-all.sql to this project`
              : `all ${REQUIRED_FUNCTIONS.length} required functions present`,
          });

          checks.push({
            name: 'storage buckets',
            status: buckets.length ? 'fail' : 'ok',
            detail: buckets.length
              ? `missing: ${buckets.join(', ')} — product images and payment proofs have nowhere to live`
              : `all ${REQUIRED_BUCKETS.length} present`,
          });

          // Reported as a warning, not a failure: a table without RLS is a real risk, but the site
          // still works, and failing the whole check here would bury the things that stop it working.
          checks.push({
            name: 'row-level security',
            status: noRls.length ? 'warn' : 'ok',
            detail: noRls.length
              ? `${noRls.length} table(s) have RLS disabled: ${noRls.join(', ')}`
              : 'enabled on every table',
          });
        }
      } catch {
        checks.push({
          name: 'migrations',
          status: 'fail',
          detail: 'the migration state could not be read',
        });
      }
    }
  }

  // ── 3. Supabase auth notes the dashboard owns ─────────────────────────────
  /*
    These are settings only the Supabase dashboard holds, so they cannot be detected from here. They
    are listed because on a new domain they are the single most common cause of "login just fails",
    and a reminder next to a green health check is cheaper than a support thread.
  */
  checks.push({
    name: 'auth redirect allow-list',
    status: 'warn',
    detail:
      'not detectable from here — in Supabase → Authentication → URL Configuration, make sure this deployment’s domain is listed under Site URL and Redirect URLs, or sign-in from this domain is refused.',
  });

  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');
  const healthy = failed.length === 0;

  return NextResponse.json(
    {
      status: healthy ? (warned.length ? 'ok_with_warnings' : 'ok') : 'unhealthy',
      summary: healthy
        ? warned.length
          ? `All required checks passed. ${warned.length} warning(s) worth reading.`
          : 'All checks passed.'
        : `${failed.length} required check(s) failing.`,
      failed: failed.length,
      warnings: warned.length,
      checkedAt: new Date().toISOString(),
      checks,
    },
    {
      status: healthy ? 200 : 503,
      // Never let an intermediary cache a diagnostic: it must describe now, not an hour ago.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
