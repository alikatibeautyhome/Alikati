'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Plus } from 'lucide-react';
import { AppointmentRow } from '@/components/admin/AppointmentRow';
import { StatTile } from '@/components/admin/StatTile';
import { WalkInModal } from '@/components/admin/WalkInModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableWrap, TBody, TH, THead, TR } from '@/components/ui/table';
import { getAppointmentsByDate, getSalonSettings, getServices } from '@/lib/api-client';
import { formatBsDate } from '@/lib/nepali-date';
import {
  STATUS_LABELS,
  addDaysISO,
  cn,
  formatDateLong,
  formatNPR,
  todayISO,
} from '@/lib/utils';
import type { Appointment, AppointmentStatus, Service } from '@/types/database.types';

/** Day heading honouring the owner's Bikram Sambat preference. */
function dayHeading(ymd: string, nepali: boolean): string {
  return nepali ? formatBsDate(ymd, { withAd: true }) : formatDateLong(ymd);
}

type StatusFilter = 'all' | AppointmentStatus;
type ViewMode = 'queue' | 'board';

const FILTERS: StatusFilter[] = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

const BOARD_COLUMNS: Array<{ status: AppointmentStatus; accent: string }> = [
  { status: 'pending', accent: 'border-t-warn' },
  { status: 'confirmed', accent: 'border-t-success' },
  { status: 'in_progress', accent: 'border-t-rose-gold' },
];

export default function AdminAppointmentsPage() {
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<ViewMode>('queue');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [nepaliDates, setNepaliDates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getAppointmentsByDate(date);
      setAppointments(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments.');
    }
  }, [date]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  // Date-display preference, loaded once. A failure keeps the BS default.
  useEffect(() => {
    let active = true;
    getSalonSettings()
      .then((settings) => {
        if (active) setNepaliDates(settings.nepali_dates);
      })
      .catch(() => {
        // Keep the default.
      });
    return () => {
      active = false;
    };
  }, []);

  // Active catalogue for the walk-in form (loaded once).
  useEffect(() => {
    let active = true;
    getServices(false)
      .then((rows) => {
        if (active) setServices(rows);
      })
      .catch(() => {
        // The walk-in modal falls back to fetching services itself.
      });
    return () => {
      active = false;
    };
  }, []);

  const counts: Record<StatusFilter, number> = {
    all: appointments.length,
    pending: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const appointment of appointments) counts[appointment.status] += 1;

  const filtered =
    filter === 'all' ? appointments : appointments.filter((row) => row.status === filter);

  const projectedRevenue = appointments
    .filter((row) => row.status !== 'cancelled')
    .reduce((sum, row) => sum + Number(row.total_amount_npr), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Appointments</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Booking management</h1>
          <p className="text-sm text-charcoal-soft">{dayHeading(date, nepaliDates)}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setWalkInOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add walk-in
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total bookings" value={String(counts.all)} />
        <StatTile label="Pending" value={String(counts.pending)} tone="pending" />
        <StatTile label="Confirmed" value={String(counts.confirmed)} tone="confirmed" />
        <StatTile label="In Progress" value={String(counts.in_progress)} tone="progress" />
        <StatTile
          label="Projected revenue"
          value={formatNPR(projectedRevenue)}
          tone="revenue"
          subLabel="Excludes cancelled"
        />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Bookings</CardTitle>
              <CardDescription>
                {filtered.length} shown · filter applies to the queue view
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-charcoal/15 bg-white p-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Previous day"
                  onClick={() => setDate((current) => addDaysISO(current, -1))}
                  className="h-8 w-8 px-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <label className="sr-only" htmlFor="appointments-date">
                  Appointment date
                </label>
                <Input
                  id="appointments-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value || todayISO())}
                  className="h-8 w-[132px] border-0 shadow-none focus-visible:ring-0 sm:w-[150px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Next day"
                  onClick={() => setDate((current) => addDaysISO(current, 1))}
                  className="h-8 w-8 px-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div
                className="flex items-center gap-1 rounded-full border border-charcoal/15 bg-white p-1"
                role="group"
                aria-label="View mode"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={view === 'queue' ? 'default' : 'ghost'}
                  onClick={() => setView('queue')}
                  aria-pressed={view === 'queue'}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                  Queue
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === 'board' ? 'default' : 'ghost'}
                  onClick={() => setView('board')}
                  aria-pressed={view === 'board'}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  Board
                </Button>
              </div>
            </div>
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((status) => {
              const active = filter === status;
              const label = status === 'all' ? 'All' : STATUS_LABELS[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-rose-gold bg-rose-gold text-white'
                      : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
                  )}
                >
                  {label}
                  <span className="rounded-full bg-charcoal/10 px-1.5 text-[10px] font-semibold text-charcoal">
                    {counts[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse-soft rounded-xl bg-charcoal/5" />
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">
                No bookings on {dayHeading(date, nepaliDates)}.
              </p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Pick another date, or add a walk-in to start the day.
              </p>
            </div>
          ) : view === 'queue' ? (
            filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-8 text-center text-sm text-charcoal-soft">
                No {filter === 'all' ? '' : STATUS_LABELS[filter].toLowerCase()} bookings on this date.
              </div>
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>Time</TH>
                      <TH>Client</TH>
                      <TH>Service</TH>
                      <TH>Reference</TH>
                      <TH>Status</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        onChange={() => void load()}
                      />
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {BOARD_COLUMNS.map((column) => {
                const rows = appointments.filter((row) => row.status === column.status);
                return (
                  <section
                    key={column.status}
                    aria-label={STATUS_LABELS[column.status]}
                    className={cn(
                      'rounded-2xl border border-charcoal/10 border-t-2 bg-cream-100/40 p-3',
                      column.accent
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-charcoal">
                        {STATUS_LABELS[column.status]}
                      </h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-charcoal-soft">
                        {rows.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {rows.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-charcoal/15 px-3 py-6 text-center text-xs text-charcoal-soft">
                          Nothing here.
                        </p>
                      ) : (
                        rows.map((appointment) => (
                          <AppointmentRow
                            key={appointment.id}
                            appointment={appointment}
                            variant="card"
                            onChange={() => void load()}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        services={services}
        onCreated={() => void load()}
      />
    </div>
  );
}
