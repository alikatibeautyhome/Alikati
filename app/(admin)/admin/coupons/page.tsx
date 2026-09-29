'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { CouponFormModal, describeCouponOffer } from '@/components/admin/CouponFormModal';
import { StatTile } from '@/components/admin/StatTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getSalonSettings } from '@/lib/api-client';
import { deleteCoupon, getCoupons, upsertCoupon } from '@/lib/marketing-api';
import { couponValidityLabel, formatBsDate } from '@/lib/nepali-date';
import { cn, formatDateLong, formatNPR } from '@/lib/utils';
import type { Coupon } from '@/types/marketing.types';

type SortKey = 'newest' | 'code' | 'used';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  code: 'Code (A–Z)',
  used: 'Most used',
};

/** UTC timestamp → local business day in Nepal, as `YYYY-MM-DD`. */
function kathmanduDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function windowLabel(coupon: Coupon, nepali: boolean): string {
  // Stored dates stay AD in the database; only the rendering follows the owner's BS preference.
  const fmt = (iso: string) => (nepali ? formatBsDate(iso, { withAd: true }) : formatDateLong(iso));
  if (!coupon.starts_at && !coupon.ends_at) return 'Always';
  const start = coupon.starts_at ? fmt(kathmanduDate(coupon.starts_at)) : null;
  const end = coupon.ends_at ? fmt(kathmanduDate(coupon.ends_at)) : null;
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  return `Until ${end}`;
}

/** Colour for the short validity label, so an expiring code stands out at a glance. */
function validityTone(label: string): string {
  if (label === 'Expired') return 'text-danger';
  if (label.startsWith('Ends in') || label === 'Ends today') return 'text-warn';
  return 'text-charcoal-soft';
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [nepaliDates, setNepaliDates] = useState(true);
  const [couponDefaultDays, setCouponDefaultDays] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getCoupons();
      setCoupons(rows);
      // The date preference and the coupon default live in settings. A hiccup there must not blank
      // the coupon list, so it is loaded best-effort.
      try {
        const settings = await getSalonSettings();
        setNepaliDates(settings.nepali_dates);
        setCouponDefaultDays(settings.coupon_default_days);
      } catch {
        // Keep the BS default and no pre-filled window.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coupons.');
    }
  }, []);

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

  // Clear the "copied" confirmation after a moment.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const setRowError = useCallback((id: string, message: string) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const run = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setBusyId(id);
      setRowError(id, '');
      setNotice(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setRowError(id, err instanceof Error ? err.message : 'Could not update this coupon.');
      } finally {
        setBusyId(null);
      }
    },
    [load, setRowError]
  );

  const summary = useMemo(() => {
    const activeCount = coupons.filter((coupon) => coupon.is_active).length;
    const redemptions = coupons.reduce((sum, coupon) => sum + Number(coupon.used_count), 0);
    const mostUsed = [...coupons]
      .filter((coupon) => Number(coupon.used_count) > 0)
      .sort((a, b) => Number(b.used_count) - Number(a.used_count))[0];
    return {
      activeCount,
      redemptions,
      mostUsedCode: mostUsed?.code ?? null,
      mostUsedCount: mostUsed ? Number(mostUsed.used_count) : 0,
    };
  }, [coupons]);

  const existingCodes = useMemo(() => coupons.map((coupon) => coupon.code), [coupons]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = coupons.filter((coupon) => {
      if (activeOnly && !coupon.is_active) return false;
      if (!needle) return true;
      return coupon.code.toLowerCase().includes(needle);
    });

    return rows.sort((a, b) => {
      switch (sort) {
        case 'code':
          return a.code.localeCompare(b.code);
        case 'used':
          return Number(b.used_count) - Number(a.used_count);
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [coupons, search, activeOnly, sort]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(coupon: Coupon) {
    setEditing(coupon);
    setFormOpen(true);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      setRowError(couponIdFor(code), 'Could not copy — long-press the code instead.');
    }
  }

  function couponIdFor(code: string): string {
    return coupons.find((coupon) => coupon.code === code)?.id ?? code;
  }

  async function toggleActive(coupon: Coupon) {
    await run(coupon.id, () =>
      upsertCoupon({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_npr: coupon.min_order_npr,
        max_discount_npr: coupon.max_discount_npr,
        usage_limit: coupon.usage_limit,
        per_customer_limit: coupon.per_customer_limit,
        starts_at: coupon.starts_at,
        ends_at: coupon.ends_at,
        is_active: !coupon.is_active,
      })
    );
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCoupon(deleteTarget.id);
      setDeleteTarget(null);
      setNotice(`Deleted ${deleteTarget.code}.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this coupon.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Shop</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Coupon control centre</h1>
          <p className="text-sm text-charcoal-soft">
            Create discount codes, cap how much they can save, and switch them off the moment an
            offer ends.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add coupon
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {notice ?? ''}
      </p>
      {notice ? (
        <p className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">{notice}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Active codes" value={String(summary.activeCount)} tone="progress" />
        <StatTile label="Total redemptions" value={String(summary.redemptions)} tone="revenue" />
        <StatTile
          label="Most used"
          value={summary.mostUsedCode ?? '—'}
          subLabel={summary.mostUsedCode ? `${summary.mostUsedCount} redemptions` : 'No redemptions yet'}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>All coupons</CardTitle>
            <CardDescription>
              {coupons.length} {coupons.length === 1 ? 'coupon' : 'coupons'} · showing {filtered.length}
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="coupons-search">
                Search by code
              </label>
              <Input
                id="coupons-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="DASHAIN20"
                autoComplete="off"
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="coupons-sort">
                Sort
              </label>
              <select
                id="coupons-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="flex h-11 w-full rounded-xl border border-charcoal/15 bg-white px-3.5 text-sm text-charcoal focus-visible:border-rose-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-gold/25"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Active codes only
          </label>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Offer</TH>
                  <TH>Min order</TH>
                  <TH>Usage</TH>
                  <TH>Window</TH>
                  <TH>Active</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading coupons…
                    </TD>
                  </TR>
                ) : coupons.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-sm text-charcoal-soft">
                      No coupons yet. Use “Add coupon” to create your first discount code.
                    </TD>
                  </TR>
                ) : filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-sm text-charcoal-soft">
                      No coupons match these filters.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((coupon) => {
                    const busy = busyId === coupon.id;
                    const limit = coupon.usage_limit;
                    const used = Number(coupon.used_count);
                    const ratio = limit && limit > 0 ? used / limit : 0;
                    const nearlyUsed = limit != null && used >= limit;
                    const almost = limit != null && !nearlyUsed && ratio >= 0.8;
                    const validity = couponValidityLabel(
                      coupon.starts_at,
                      coupon.ends_at,
                      coupon.is_active
                    );

                    return (
                      <TR key={coupon.id} className="align-top">
                        <TD className="min-w-[150px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium uppercase tracking-wide text-charcoal">
                              {coupon.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyCode(coupon.code)}
                              aria-label={`Copy coupon code ${coupon.code}`}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal sm:h-8 sm:w-8"
                            >
                              {copied === coupon.code ? (
                                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                              ) : (
                                <Copy className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                          {coupon.description ? (
                            <p className="mt-1 max-w-[14rem] truncate text-xs text-charcoal-soft">
                              {coupon.description}
                            </p>
                          ) : null}
                          {!coupon.is_active ? (
                            <Badge className="mt-1 bg-charcoal/10 text-charcoal-soft">Inactive</Badge>
                          ) : null}
                        </TD>
                        <TD className="min-w-[200px] text-charcoal">
                          {describeCouponOffer(coupon)}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {Number(coupon.min_order_npr) > 0 ? formatNPR(coupon.min_order_npr) : 'None'}
                        </TD>
                        <TD className="whitespace-nowrap">
                          <span className="font-medium text-charcoal">{used}</span>
                          <span className="text-charcoal-soft">
                            {' / '}
                            {limit != null ? limit : '∞'}
                          </span>
                          {nearlyUsed ? (
                            <p className="mt-1 text-xs font-medium text-danger">Fully redeemed</p>
                          ) : almost ? (
                            <p className="mt-1 text-xs font-medium text-warn">
                              {limit != null ? `Almost used up (${limit - used} left)` : null}
                            </p>
                          ) : null}
                        </TD>
                        <TD className="min-w-[190px]">
                          <span className="block text-charcoal-soft">{windowLabel(coupon, nepaliDates)}</span>
                          <span className={cn('mt-1 inline-block text-xs font-medium', validityTone(validity))}>
                            {validity}
                          </span>
                        </TD>
                        <TD>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={coupon.is_active}
                            aria-label={`${coupon.is_active ? 'Deactivate' : 'Activate'} coupon ${coupon.code}`}
                            disabled={busy}
                            onClick={() => void toggleActive(coupon)}
                            className={cn(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                              coupon.is_active ? 'bg-success' : 'bg-charcoal/20'
                            )}
                          >
                            <span
                              className={cn(
                                'inline-block h-5 w-5 transform rounded-full bg-[#ffffff] shadow-soft ring-1 ring-charcoal/10 transition-transform',
                                coupon.is_active ? 'translate-x-5' : 'translate-x-0.5'
                              )}
                            />
                          </button>
                        </TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(coupon)}
                              aria-label={`Edit coupon ${coupon.code}`}
                              className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-10 w-10 px-0 text-danger hover:bg-danger/10 sm:h-8 sm:w-8"
                              onClick={() => {
                                setDeleteTarget(coupon);
                                setDeleteError(null);
                              }}
                              aria-label={`Delete coupon ${coupon.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                          {rowErrors[coupon.id] ? (
                            <p role="alert" className="mt-1 text-xs font-medium text-danger">
                              {rowErrors[coupon.id]}
                            </p>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <CouponFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        coupon={editing}
        existingCodes={existingCodes}
        defaultDays={couponDefaultDays}
        onSaved={(saved) => {
          setNotice(`Saved ${saved.code}.`);
          void load();
        }}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete coupon"
        description={deleteTarget ? `Delete the code “${deleteTarget.code}”?` : 'Delete this coupon?'}
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Orders that already used this code keep the discount they were given — the coupon table
            only controls future redemptions. To pause a code without losing its history, switch{' '}
            <span className="font-medium">Active</span> off instead.
          </p>
          {deleteError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {deleteError}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              Keep coupon
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              loading={deleting}
              className="w-full sm:w-auto"
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
