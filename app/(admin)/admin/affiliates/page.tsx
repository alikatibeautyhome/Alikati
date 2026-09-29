'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Check, Copy, Pencil, Phone, Plus, Trash2, UserPlus, Wallet } from 'lucide-react';
import { AffiliateFormModal } from '@/components/admin/AffiliateFormModal';
import { AffiliatePayoutModal } from '@/components/admin/AffiliatePayoutModal';
import { StatTile } from '@/components/admin/StatTile';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getSalonSettings } from '@/lib/api-client';
import {
  buildAffiliatePerformance,
  buildReferralLink,
  deleteAffiliate,
  getAffiliates,
  setAffiliateStatus,
} from '@/lib/marketing-api';
import { getOrders } from '@/lib/shop-admin-api';
import { socialProfileLinks } from '@/lib/socials';
import { cn, formatDateLong, formatNPR, formatNPRCompact, normalizeWhatsAppNumber } from '@/lib/utils';
import type { Affiliate, AffiliatePerformance, AffiliateStatus } from '@/types/marketing.types';
import type { Order } from '@/types/commerce.types';

const STATUS_LABELS: Record<AffiliateStatus, string> = {
  pending: 'Pending approval',
  active: 'Active',
  suspended: 'Suspended',
};

const STATUS_STYLES: Record<AffiliateStatus, string> = {
  pending: 'bg-warn/10 text-warn ring-warn/25',
  active: 'bg-success/10 text-success ring-success/25',
  suspended: 'bg-danger/10 text-danger ring-danger/25',
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

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [defaultRate, setDefaultRate] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [payoutTarget, setPayoutTarget] = useState<AffiliatePerformance | null>(null);

  const [suspendTarget, setSuspendTarget] = useState<Affiliate | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Affiliate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [affiliateRows, orderRows, settings] = await Promise.all([
        getAffiliates(),
        getOrders(),
        // A missing settings row must not blank the programme — fall back to the 10% default.
        getSalonSettings().catch(() => null),
      ]);
      setAffiliates(affiliateRows);
      setOrders(orderRows);
      setDefaultRate(Number(settings?.affiliate_commission_rate) || 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the affiliate programme.');
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

  useEffect(() => {
    if (!copiedCode) return;
    const timer = window.setTimeout(() => setCopiedCode(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedCode]);

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
        setRowError(id, err instanceof Error ? err.message : 'Could not update this affiliate.');
      } finally {
        setBusyId(null);
      }
    },
    [load, setRowError]
  );

  /** Pending applications float to the top — they need the owner's approval to work. */
  const rows = useMemo(() => {
    const performance = buildAffiliatePerformance(affiliates, orders);
    return [...performance].sort((a, b) => {
      const pendingA = a.affiliate.status === 'pending' ? 0 : 1;
      const pendingB = b.affiliate.status === 'pending' ? 0 : 1;
      if (pendingA !== pendingB) return pendingA - pendingB;
      return b.commission_npr - a.commission_npr;
    });
  }, [affiliates, orders]);

  const pendingCount = useMemo(
    () => affiliates.filter((affiliate) => affiliate.status === 'pending').length,
    [affiliates]
  );

  const summary = useMemo(() => {
    const active = affiliates.filter((affiliate) => affiliate.status === 'active').length;
    const earned = rows.reduce((sum, row) => sum + row.commission_npr, 0);
    const outstanding = rows.reduce((sum, row) => sum + row.outstanding_npr, 0);
    return { active, earned, outstanding };
  }, [affiliates, rows]);

  const existingCodes = useMemo(() => affiliates.map((affiliate) => affiliate.code), [affiliates]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(affiliate: Affiliate) {
    setEditing(affiliate);
    setFormOpen(true);
  }

  async function approve(affiliate: Affiliate) {
    await run(affiliate.id, () => setAffiliateStatus(affiliate.id, 'active'));
    setNotice(`${affiliate.name} is now active — their code will earn commission.`);
  }

  async function copyLink(affiliate: Affiliate) {
    try {
      await navigator.clipboard.writeText(buildReferralLink(affiliate.code));
      setCopiedCode(affiliate.code);
    } catch {
      setRowError(affiliate.id, 'Could not copy — open the list on a device that allows copy.');
    }
  }

  async function confirmSuspend() {
    if (!suspendTarget) return;
    setSuspending(true);
    setSuspendError(null);
    try {
      await setAffiliateStatus(suspendTarget.id, 'suspended');
      setSuspendTarget(null);
      setNotice(`${suspendTarget.name} is suspended. Their code no longer earns commission.`);
      await load();
    } catch (err) {
      setSuspendError(err instanceof Error ? err.message : 'Could not suspend this affiliate.');
    } finally {
      setSuspending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAffiliate(deleteTarget.id);
      setDeleteTarget(null);
      setNotice(`Removed ${deleteTarget.name} from the programme.`);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this affiliate.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Shop</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl text-charcoal">Affiliate programme</h1>
            {pendingCount > 0 ? (
              <Badge className="bg-warn/10 text-warn ring-warn/25">
                {pendingCount} pending approval
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-charcoal-soft">
            Approve applicants, share referral links, and record payouts. Only active affiliates earn
            commission.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add affiliate
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
        <StatTile label="Active affiliates" value={String(summary.active)} tone="confirmed" />
        <StatTile
          label="Commission earned"
          value={formatNPRCompact(summary.earned)}
          subLabel="All time"
          tone="revenue"
        />
        <StatTile
          label="Outstanding"
          value={formatNPRCompact(summary.outstanding)}
          subLabel="Still to pay"
          tone="pending"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse-soft rounded-xl bg-charcoal/5" />
            ))}
          </CardContent>
        </Card>
      ) : affiliates.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <UserPlus className="mx-auto h-8 w-8 text-rose-gold" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-charcoal">No affiliates yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-charcoal-soft">
                People apply on the public <span className="font-medium">/affiliate</span> page and
                appear here as <span className="font-medium">pending</span>. Approve an application to
                activate its code. An affiliate only earns commission while their status is{' '}
                <span className="font-medium">active</span>.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Programme members</CardTitle>
            <CardDescription>
              {affiliates.length} {affiliates.length === 1 ? 'affiliate' : 'affiliates'} ·{' '}
              {pendingCount} awaiting approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Affiliate</TH>
                    <TH>Social accounts</TH>
                    <TH>Code</TH>
                    <TH>Phone</TH>
                    <TH>Rate</TH>
                    <TH>Status</TH>
                    <TH>Orders</TH>
                    <TH>Revenue</TH>
                    <TH>Commission</TH>
                    <TH>Outstanding</TH>
                    <TH>Last order</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const affiliate = row.affiliate;
                    const busy = busyId === affiliate.id;
                    const pending = affiliate.status === 'pending';
                    const outstanding = Number(row.outstanding_npr);
                    // The accounts an application is actually judged on — opened in a new tab so a
                    // reviewer does not lose their place in the queue.
                    const socials = socialProfileLinks(affiliate);

                    return (
                      <TR
                        key={affiliate.id}
                        className={cn('align-top', pending && 'bg-warn/5')}
                      >
                        <TD className="min-w-[180px]">
                          <p className="font-medium text-charcoal">{affiliate.name}</p>
                          {affiliate.email ? (
                            <p className="max-w-[14rem] truncate text-xs text-charcoal-soft">
                              {affiliate.email}
                            </p>
                          ) : null}
                          {affiliate.notes ? (
                            <p className="mt-1 max-w-[16rem] truncate text-xs text-charcoal-soft" title={affiliate.notes}>
                              {affiliate.notes}
                            </p>
                          ) : null}
                        </TD>
                        <TD className="min-w-[130px]">
                          {socials.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {socials.map((link) => (
                                <a
                                  key={link.label}
                                  href={link.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium text-rose-gold hover:underline"
                                >
                                  {link.label}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-charcoal-soft">None given</span>
                          )}
                        </TD>
                        <TD className="min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm uppercase tracking-wide text-charcoal">
                              {affiliate.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyLink(affiliate)}
                              aria-label={`Copy referral link for ${affiliate.name}`}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal sm:h-8 sm:w-8"
                            >
                              {copiedCode === affiliate.code ? (
                                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                              ) : (
                                <Copy className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-charcoal-soft">/?ref={affiliate.code}</p>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <a
                              href={`tel:${affiliate.phone}`}
                              aria-label={`Call ${affiliate.name}`}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal sm:h-8 sm:w-8"
                            >
                              <Phone className="h-4 w-4" aria-hidden="true" />
                            </a>
                            <a
                              href={`https://wa.me/${normalizeWhatsAppNumber(affiliate.phone)}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`WhatsApp ${affiliate.name}`}
                              className="text-xs font-medium text-success hover:underline"
                            >
                              WhatsApp
                            </a>
                          </div>
                          <p className="mt-1 text-xs text-charcoal-soft">{affiliate.phone}</p>
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal">{affiliate.commission_rate}%</TD>
                        <TD className="whitespace-nowrap">
                          <StatusBadge className={STATUS_STYLES[affiliate.status]}>
                            {STATUS_LABELS[affiliate.status]}
                          </StatusBadge>
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">{row.orders}</TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {formatNPR(row.revenue_npr)}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal">
                          {formatNPR(row.commission_npr)}
                        </TD>
                        <TD className="whitespace-nowrap font-medium text-charcoal">
                          {formatNPR(outstanding)}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {row.last_order_at ? formatDateLong(kathmanduDate(row.last_order_at)) : '—'}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pending ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                disabled={busy}
                                onClick={() => void approve(affiliate)}
                                aria-label={`Approve ${affiliate.name}`}
                                className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">Approve</span>
                              </Button>
                            ) : null}

                            {affiliate.status === 'active' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setSuspendTarget(affiliate);
                                  setSuspendError(null);
                                }}
                                aria-label={`Suspend ${affiliate.name}`}
                                className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                              >
                                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">Suspend</span>
                              </Button>
                            ) : null}

                            {affiliate.status === 'suspended' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                disabled={busy}
                                onClick={() => void approve(affiliate)}
                                aria-label={`Reactivate ${affiliate.name}`}
                                className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">Reactivate</span>
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(affiliate)}
                              aria-label={`Edit ${affiliate.name}`}
                              className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden lg:inline">Edit</span>
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || outstanding <= 0}
                              onClick={() => setPayoutTarget(row)}
                              aria-label={`Record payout for ${affiliate.name}`}
                              className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                            >
                              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="hidden lg:inline">Payout</span>
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-10 w-10 px-0 text-danger hover:bg-danger/10 sm:h-8 sm:w-8"
                              onClick={() => {
                                setDeleteTarget(affiliate);
                                setDeleteError(null);
                              }}
                              aria-label={`Delete ${affiliate.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                          {rowErrors[affiliate.id] ? (
                            <p role="alert" className="mt-1 text-xs font-medium text-danger">
                              {rowErrors[affiliate.id]}
                            </p>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      <AffiliateFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        affiliate={editing}
        existingCodes={existingCodes}
        defaultRate={defaultRate}
        onSaved={(saved) => {
          setNotice(`Saved ${saved.name}.`);
          void load();
        }}
      />

      <AffiliatePayoutModal
        open={payoutTarget !== null}
        onClose={() => setPayoutTarget(null)}
        performance={payoutTarget}
        onPaid={() => {
          setNotice('Payout recorded.');
          void load();
        }}
      />

      <Modal
        open={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        size="sm"
        title="Suspend affiliate"
        description={suspendTarget ? `Suspend ${suspendTarget.name}?` : 'Suspend this affiliate?'}
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Their referral code stops earning commission and their referral link stops working. Orders
            already attributed keep the commission they earned. You can reactivate them at any time.
          </p>
          {suspendError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {suspendError}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSuspendTarget(null)}
              disabled={suspending}
              className="w-full sm:w-auto"
            >
              Keep active
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmSuspend()}
              loading={suspending}
              className="w-full sm:w-auto"
            >
              Suspend affiliate
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete affiliate"
        description={deleteTarget ? `Remove ${deleteTarget.name} from the programme?` : 'Delete this affiliate?'}
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            This permanently removes the affiliate record. Past orders keep their referral code and
            commission, but the outstanding balance is lost — record any payout first. To pause instead,
            suspend them.
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
              Keep affiliate
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
