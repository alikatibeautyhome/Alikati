'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Eye, Globe, Info, Loader2, RefreshCw, Users } from 'lucide-react';
import { TrafficTrendChart } from '@/components/admin/TrafficTrendChart';
import { StatTile } from '@/components/admin/StatTile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getTrafficSnapshot, type TrafficRow, type TrafficSnapshot } from '@/lib/traffic-admin-api';
import { DEVICE_LABELS, SOURCE_LABELS } from '@/lib/traffic';
import { cn } from '@/lib/utils';

/**
 * Traffic — what the storefront is actually being served.
 *
 * Read-only by construction. Nothing on this page can edit a page view, because the database
 * refuses UPDATE and DELETE on `traffic_events` and the endpoint that writes them is unauthenticated
 * and append-only. There is no delete control here for the same reason the security log has none.
 */

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** A label plus a proportional bar. Used for every breakdown so they read as one system. */
function BreakdownList({
  rows,
  emptyLabel,
  labelMap,
  linkToPath = false,
}: {
  rows: TrafficRow[];
  emptyLabel: string;
  labelMap?: Record<string, string>;
  linkToPath?: boolean;
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-charcoal-soft">{emptyLabel}</p>;
  }

  const peak = Math.max(...rows.map((r) => r.views), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const label = labelMap?.[row.label] ?? row.label;
        return (
          <li key={row.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-charcoal" title={row.label}>
                {linkToPath && row.label !== '—' ? (
                  <a
                    href={row.label}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:text-rose-gold hover:underline"
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
                {row.detail ? (
                  <span className="ml-1.5 text-xs text-charcoal-soft">{row.detail}</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-charcoal-soft">
                {row.views.toLocaleString('en-GB')}
                <span className="ml-2 text-xs opacity-70">
                  {row.visitors.toLocaleString('en-GB')} people
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-charcoal/8">
              <div
                className="h-full rounded-full bg-rose-gold/70"
                style={{ width: `${Math.max((row.views / peak) * 100, 2)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminTrafficPage() {
  const [days, setDays] = useState<number>(30);
  const [snapshot, setSnapshot] = useState<TrafficSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getTrafficSnapshot(range));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not load traffic. ${cause.message}`
          : 'Could not load traffic.'
      );
      setSnapshot(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  const summary = snapshot?.summary;
  const bounceRate = summary && summary.sessions ? summary.bounces / summary.sessions : 0;
  const perVisit = summary && summary.sessions ? summary.views / summary.sessions : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Growth</p>
          <h1 className="mt-1 font-display text-3xl text-charcoal">Traffic</h1>
          <p className="mt-1 max-w-2xl text-sm text-charcoal-soft">
            What the storefront is serving and where the people come from. Covers public pages only —
            the console itself is not measured.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => load(days)} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </div>

      {/* The range control is deliberately three buttons rather than a picker — there are three
          answers anyone actually wants, and a picker would make each one two taps. */}
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex rounded-full border border-charcoal/10 bg-white p-1 shadow-soft"
      >
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            onClick={() => setDays(range.days)}
            aria-pressed={days === range.days}
            className={cn(
              'min-h-9 rounded-full px-4 text-sm font-medium transition-colors',
              days === range.days
                ? 'bg-rose-gold text-white'
                : 'text-charcoal-soft hover:bg-blush-100 hover:text-charcoal'
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        Stated on the page, not just in a commit message. These figures only include visitors who
        accepted cookies — the beacon is silent for anyone who chose "essential only" or dismissed
        the banner — so the totals are a floor rather than a census. Without this note the numbers
        read as low traffic when they are really partly unmeasured traffic, and someone would make a
        decision on them.
      */}
      <p className="flex items-start gap-2 rounded-xl bg-blush-100 p-3 text-sm text-charcoal-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
        <span>
          Counts visitors who accepted cookies only. Anyone who chose &ldquo;essential only&rdquo;, or
          dismissed the notice, is not recorded — so treat these as a floor and read the trend rather
          than the total.
        </span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Unique visitors"
          value={(summary?.visitors ?? 0).toLocaleString('en-GB')}
          subLabel={`Per Nepal day · last ${days} days`}
          tone="progress"
        />
        <StatTile
          label="Page views"
          value={(summary?.views ?? 0).toLocaleString('en-GB')}
          subLabel={`${perVisit ? perVisit.toFixed(1) : '—'} pages per visit`}
          tone="revenue"
        />
        <StatTile
          label="Visits"
          value={(summary?.sessions ?? 0).toLocaleString('en-GB')}
          subLabel="Browser sessions"
        />
        <StatTile
          label="Bounce rate"
          value={summary?.sessions ? pct(summary.bounces, summary.sessions) : '—'}
          subLabel={`${summary?.bounces ?? 0} single-page visits`}
          tone={bounceRate > 0.7 ? 'pending' : 'confirmed'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden="true" />
            Visits over time
          </CardTitle>
          <CardDescription>
            Views and unique visitors per Nepal day. Days with no traffic are plotted as zero rather
            than skipped, so a gap in the line means nobody came.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !snapshot ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-charcoal-soft" aria-hidden="true" />
            </div>
          ) : (
            <TrafficTrendChart data={snapshot?.daily ?? []} days={days} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Top pages
            </CardTitle>
            <CardDescription>Where attention actually lands.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={snapshot?.pages ?? []}
              emptyLabel="No page views recorded yet."
              linkToPath
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Sources
            </CardTitle>
            <CardDescription>
              Affiliate wins over the referrer, so a <code className="text-xs">?ref=</code> link is
              credited to the affiliate rather than to the platform it was posted on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={snapshot?.sources ?? []}
              emptyLabel="No arrivals recorded yet."
              labelMap={SOURCE_LABELS}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" />
              Devices
            </CardTitle>
            <CardDescription>How people are reading the storefront.</CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={snapshot?.devices ?? []}
              emptyLabel="No devices recorded yet."
              labelMap={DEVICE_LABELS}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Countries
            </CardTitle>
            <CardDescription>
              From the edge&rsquo;s geo header. Local traffic is expected to dominate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={snapshot?.countries ?? []}
              emptyLabel="No locations recorded yet."
              // The SQL coalesces an absent geo header to 'XX' so the group is not dropped.
              labelMap={{ XX: 'Unknown' }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
