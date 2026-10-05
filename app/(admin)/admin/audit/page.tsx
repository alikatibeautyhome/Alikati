'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';

interface SecurityEvent {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  summary: string;
  ip: string | null;
}

/**
 * The security log.
 *
 * Read-only, and there is no delete control — not because one was forgotten, but because the table
 * refuses UPDATE and DELETE at the database level even for the service role. A log the console can
 * edit is not evidence, so the absence of a button here is the point rather than an omission.
 *
 * `action` values are dotted verbs. The badge colour is derived from the prefix so a new action
 * added elsewhere in the app still renders sensibly without being registered here first.
 */
function toneFor(action: string): string {
  if (action.startsWith('staff.created') || action.includes('promoted')) return 'bg-warn/10 text-warn ring-warn/25';
  if (action.includes('disabled') || action.includes('deactivated') || action.includes('deleted')) {
    return 'bg-danger/10 text-danger ring-danger/25';
  }
  if (action.startsWith('mfa.')) return 'bg-success/10 text-success ring-success/25';
  return 'bg-charcoal/10 text-charcoal-soft ring-charcoal/20';
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAuditPage() {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (isDemoMode()) {
      setEvents([]);
      setLoading(false);
      return;
    }
    /*
      Read straight from the view with the signed-in staff session, so Row-Level Security decides
      what is visible rather than the client. A non-staff account gets an empty list from the
      database, not a hidden button.
    */
    const { data, error: readError } = await getSupabaseBrowserClient()
      .from('v_recent_security_events')
      .select('id, created_at, actor_email, action, entity, entity_id, summary, ip')
      .order('created_at', { ascending: false })
      .limit(300);

    if (readError) {
      setError('Could not load the security log.');
      setEvents([]);
    } else {
      setEvents((data ?? []) as SecurityEvent[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const q = query.trim().toLowerCase();
    if (!q) return events;
    // Filtered in the browser over the already-fetched window: the log is 500 rows at most, so a
    // round trip per keystroke would buy nothing.
    return events.filter((e) =>
      [e.actor_email, e.action, e.summary, e.entity, e.ip]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [events, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="mt-1 font-display text-3xl text-charcoal">Security log</h1>
          <p className="mt-1 max-w-2xl text-sm text-charcoal-soft">
            Who changed what in the console. Entries can be added but never edited or deleted — not
            even by an administrator — so the record is evidence rather than a summary.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" aria-hidden="true" />
            Recent activity
          </CardTitle>
          <CardDescription>
            The 300 most recent entries. Account creation, role changes, password changes and
            two-factor changes are all recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by person, action or summary"
              className="pl-9"
              aria-label="Filter the security log"
            />
          </div>

          {loading && !events ? (
            <p className="py-8 text-center text-sm text-charcoal-soft">Loading…</p>
          ) : !filtered || filtered.length === 0 ? (
            <p className="rounded-xl bg-blush-100 p-4 text-sm text-charcoal-soft">
              {query
                ? 'No entries match that filter.'
                : 'Nothing recorded yet. Entries appear here as soon as an account is created, changed or protected with two-factor authentication.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <caption className="sr-only">Security events, most recent first</caption>
                <thead>
                  <tr className="border-b border-charcoal/10 text-left text-xs uppercase tracking-wide text-charcoal-soft">
                    <th scope="col" className="py-2 pr-4 font-medium">When</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Who</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Action</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Detail</th>
                    <th scope="col" className="py-2 font-medium">From</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <tr key={event.id} className="border-b border-charcoal/5 align-top">
                      <td className="whitespace-nowrap py-3 pr-4 text-charcoal-soft">
                        {when(event.created_at)}
                      </td>
                      <td className="py-3 pr-4 text-charcoal">
                        {event.actor_email ?? <span className="text-charcoal-soft">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className={toneFor(event.action)}>{event.action}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-charcoal">{event.summary}</td>
                      <td className="py-3 font-mono text-xs text-charcoal-soft">
                        {event.ip ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
