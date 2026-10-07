/**
 * Traffic reads for the admin console.
 *
 * Browser-only, like `lib/reviews-admin-api.ts` and `lib/shop-admin-api.ts`: these calls go through
 * the signed-in staff session and let Row-Level Security decide what is visible, so nothing here
 * needs the service key and nothing here can widen access on its own.
 *
 * All the aggregation happens in Postgres (migration 0031) rather than in the browser. The console
 * asks for four small results instead of pulling thousands of page-view rows down and counting them
 * client-side — which on a storefront with real traffic would mean a large transfer on every open
 * of the page, and an answer that silently truncates at whatever row limit was configured.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';

export interface TrafficSummary {
  views: number;
  visitors: number;
  sessions: number;
  bounces: number;
}

export interface TrafficDay {
  day: string;
  views: number;
  visitors: number;
  sessions: number;
}

export interface TrafficRow {
  label: string;
  detail: string | null;
  views: number;
  visitors: number;
}

export type TrafficDimension = 'path' | 'source' | 'device' | 'country' | 'browser';

export interface TrafficSnapshot {
  summary: TrafficSummary;
  daily: TrafficDay[];
  pages: TrafficRow[];
  sources: TrafficRow[];
  devices: TrafficRow[];
  countries: TrafficRow[];
}

const EMPTY_SUMMARY: TrafficSummary = { views: 0, visitors: 0, sessions: 0, bounces: 0 };

/** Postgres returns BIGINT as a string through PostgREST; every counter goes through here. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function toTrafficRow(row: Record<string, unknown>): TrafficRow {
  return {
    label: String(row.label ?? '—'),
    detail: row.detail === null || row.detail === undefined ? null : String(row.detail),
    views: num(row.views),
    visitors: num(row.visitors),
  };
}

/**
 * Everything the page needs, in one batch.
 *
 * The five calls are independent so they are issued together rather than awaited in sequence —
 * five round trips one after another would be five times the latency for no added safety.
 *
 * Demo mode returns an empty snapshot rather than throwing: the preview build has no database, and
 * a page that renders "no traffic yet" is a better preview than one showing five error banners.
 */
export async function getTrafficSnapshot(days: number): Promise<TrafficSnapshot> {
  if (isDemoMode()) {
    return { summary: EMPTY_SUMMARY, daily: [], pages: [], sources: [], devices: [], countries: [] };
  }

  const supabase = getSupabaseBrowserClient();
  const args = { p_days: days };

  const [summary, daily, pages, sources, devices, countries] = await Promise.all([
    supabase.rpc('traffic_summary', args),
    supabase.rpc('traffic_daily', args),
    supabase.rpc('traffic_breakdown', { ...args, p_dimension: 'path', p_limit: 12 }),
    supabase.rpc('traffic_breakdown', { ...args, p_dimension: 'source', p_limit: 8 }),
    supabase.rpc('traffic_breakdown', { ...args, p_dimension: 'device', p_limit: 4 }),
    supabase.rpc('traffic_breakdown', { ...args, p_dimension: 'country', p_limit: 8 }),
  ]);

  const firstError =
    summary.error || daily.error || pages.error || sources.error || devices.error || countries.error;
  if (firstError) {
    // Surfaced rather than swallowed: the most likely cause is migration 0031 not being applied,
    // and a silent empty page would send someone looking for a traffic problem instead of a
    // deployment problem.
    throw new Error(firstError.message);
  }

  const summaryRow = rows(summary.data)[0] ?? {};

  return {
    summary: {
      views: num(summaryRow.views),
      visitors: num(summaryRow.visitors),
      sessions: num(summaryRow.sessions),
      bounces: num(summaryRow.bounces),
    },
    daily: rows(daily.data).map((row) => ({
      day: String(row.day ?? ''),
      views: num(row.views),
      visitors: num(row.visitors),
      sessions: num(row.sessions),
    })),
    pages: rows(pages.data).map(toTrafficRow),
    sources: rows(sources.data).map(toTrafficRow),
    devices: rows(devices.data).map(toTrafficRow),
    countries: rows(countries.data).map(toTrafficRow),
  };
}
