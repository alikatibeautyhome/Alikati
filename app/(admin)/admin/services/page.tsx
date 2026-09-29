'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { ServiceFormModal } from '@/components/admin/ServiceFormModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  deleteService,
  getServices,
  setServiceDiscount,
  toggleServiceActive,
  updateService,
} from '@/lib/api-client';
import {
  CATEGORY_LABELS,
  cn,
  discountPercent,
  formatDuration,
  formatNPR,
} from '@/lib/utils';
import type { Service } from '@/types/database.types';

export default function AdminServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const [promoId, setPromoId] = useState<string | null>(null);
  const [promoValue, setPromoValue] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getServices(true);
      setServices(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load services.');
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

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setFormOpen(true);
  }

  function openPromotion(service: Service) {
    setPromoId(service.id);
    setPromoValue(service.discount_price_npr != null ? String(service.discount_price_npr) : '');
    setPromoError(null);
  }

  async function savePromotion(service: Service) {
    const value = Number(promoValue);
    if (promoValue.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setPromoError('Enter a promotion price greater than 0.');
      return;
    }
    if (value >= service.price_npr) {
      setPromoError('Promotion price must be less than the base price.');
      return;
    }
    setBusyId(service.id);
    setPromoError(null);
    try {
      await setServiceDiscount(service.id, value);
      setPromoId(null);
      await load();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Could not save the promotion.');
    } finally {
      setBusyId(null);
    }
  }

  async function clearPromotion(service: Service) {
    setBusyId(service.id);
    setPromoError(null);
    try {
      await setServiceDiscount(service.id, null);
      setPromoId(null);
      await load();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Could not clear the promotion.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(service: Service) {
    setBusyId(service.id);
    try {
      await toggleServiceActive(service.id, !service.is_active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the service.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFeatured(service: Service) {
    setBusyId(service.id);
    try {
      await updateService(service.id, { is_featured: !service.is_featured });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the service.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteService(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this service.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Services</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Price &amp; catalogue manager</h1>
          <p className="text-sm text-charcoal-soft">
            Promotions write to the discount price only — the base price is never overwritten.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add service
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All services</CardTitle>
          <CardDescription>
            Toggle a promotion to set a limited-time price. To revert, clear the promotion — the base
            price stays untouched.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Service</TH>
                  <TH>Category</TH>
                  <TH>Duration</TH>
                  <TH>Base price</TH>
                  <TH>Promotion</TH>
                  <TH>Active</TH>
                  <TH>Featured</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading services…
                    </TD>
                  </TR>
                ) : services.length === 0 ? (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-sm text-charcoal-soft">
                      No services yet. Use “Add service” to build your catalogue.
                    </TD>
                  </TR>
                ) : (
                  services.map((service) => {
                    const busy = busyId === service.id;
                    const percent = discountPercent(service);
                    return (
                      <Fragment key={service.id}>
                        <TR>
                          <TD className="min-w-[200px] max-w-[16rem]">
                            <p className="truncate font-medium text-charcoal" title={service.title}>
                              {service.title}
                            </p>
                            <p className="truncate text-xs text-charcoal-soft">/{service.slug}</p>
                          </TD>
                          <TD className="text-charcoal-soft">{CATEGORY_LABELS[service.category]}</TD>
                          <TD className="whitespace-nowrap text-charcoal-soft">
                            {formatDuration(service.duration_minutes)}
                          </TD>
                          <TD className="whitespace-nowrap text-charcoal">
                            {formatNPR(service.price_npr)}
                          </TD>
                          <TD className="whitespace-nowrap">
                            {service.discount_price_npr != null ? (
                              <span className="font-medium text-rose-gold">
                                {formatNPR(service.discount_price_npr)}
                                {percent != null ? (
                                  <span className="ml-1 text-xs text-charcoal-soft">−{percent}%</span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="text-charcoal-soft">—</span>
                            )}
                          </TD>
                          <TD>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={service.is_active}
                              aria-label={`${service.is_active ? 'Deactivate' : 'Activate'} ${service.title}`}
                              disabled={busy}
                              onClick={() => void toggleActive(service)}
                               className={cn(
                                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                                 service.is_active ? 'bg-success' : 'bg-charcoal/20'
                               )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                                  service.is_active ? 'translate-x-5' : 'translate-x-0.5'
                                )}
                              />
                            </button>
                          </TD>
                          <TD>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={service.is_featured}
                              aria-label={`${service.is_featured ? 'Unfeature' : 'Feature'} ${service.title}`}
                              disabled={busy}
                              onClick={() => void toggleFeatured(service)}
                               className={cn(
                                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                                 service.is_featured ? 'bg-rose-gold' : 'bg-charcoal/20'
                               )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                                  service.is_featured ? 'translate-x-5' : 'translate-x-0.5'
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
                                 onClick={() => openEdit(service)}
                                 aria-label={`Edit ${service.title}`}
                                 className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                               >
                                 <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                 <span className="hidden sm:inline">Edit</span>
                               </Button>
                               <Button
                                 type="button"
                                 size="sm"
                                 variant={promoId === service.id ? 'default' : 'secondary'}
                                 onClick={() =>
                                   promoId === service.id ? setPromoId(null) : openPromotion(service)
                                 }
                                 aria-label={`Set promotion for ${service.title}`}
                                 className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                               >
                                 <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                                 <span className="hidden sm:inline">Promote</span>
                               </Button>
                               <Button
                                 type="button"
                                 size="sm"
                                 variant="ghost"
                                 onClick={() => {
                                   setDeleteTarget(service);
                                   setDeleteError(null);
                                 }}
                                 aria-label={`Delete ${service.title}`}
                                 className="h-10 w-10 px-0 text-danger hover:bg-danger/10 sm:h-8 sm:w-8"
                               >
                                 <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                               </Button>
                             </div>
                          </TD>
                        </TR>

                        {promoId === service.id ? (
                          <TR>
                            <TD colSpan={8} className="bg-cream-100/70">
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="space-y-1.5">
                                  <Label htmlFor={`promo-${service.id}`}>
                                    Promotion price (NPR) — base {formatNPR(service.price_npr)}
                                  </Label>
                                  <Input
                                    id={`promo-${service.id}`}
                                    type="number"
                                    min={1}
                                    value={promoValue}
                                    onChange={(event) => setPromoValue(event.target.value)}
                                    aria-invalid={Boolean(promoError)}
                                    className="w-40"
                                    placeholder="e.g. 4000"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void savePromotion(service)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : null}
                                  Save promotion
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void clearPromotion(service)}
                                  disabled={busy || service.discount_price_npr == null}
                                >
                                  Clear promotion
                                </Button>
                                <p className="text-xs text-charcoal-soft">
                                  Only <span className="font-medium">discount_price_npr</span> changes —
                                  the base price is never overwritten.
                                </p>
                              </div>
                              {promoError ? (
                                <p role="alert" className="mt-2 text-xs font-medium text-danger">
                                  {promoError}
                                </p>
                              ) : null}
                            </TD>
                          </TR>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <ServiceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        service={editing}
        onSaved={() => void load()}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete service"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.title}” from the catalogue?`
            : 'Delete this service from the catalogue?'
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Services with booking history cannot be deleted — deactivate them instead so past
            appointments still display correctly.
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
              Keep service
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
