'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCheck,
  Eye,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  getOrders,
  getPaymentProofUrl,
  getProducts,
  updateOrder,
  updateOrderStatus,
} from '@/lib/shop-admin-api';
import { getSalonSettings } from '@/lib/api-client';
import { formatBsDate } from '@/lib/nepali-date';
import { productImageSrc } from '@/lib/product-image';
import { createOrderStatusLink } from '@/lib/whatsapp';
import {
  NEXT_ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  orderStatusCounts,
} from '@/lib/commerce';
import { cn, formatDateLong, formatNPR, formatPhoneDisplay, to12Hour, todayISO } from '@/lib/utils';
import type { Order, OrderItem, OrderStatus } from '@/types/commerce.types';

type StatusFilter = OrderStatus | 'all';

const FILTERS: StatusFilter[] = [
  'all',
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
];

/** Business date (Asia/Kathmandu) of an ISO timestamp, as YYYY-MM-DD. */
function kathmanduDate(iso: string): string {
  return todayISO(new Date(iso));
}

/** Business time (Asia/Kathmandu) of an ISO timestamp, as `h:mm AM/PM`. */
function kathmanduTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return to12Hour(parts);
}

function itemCount(order: Order): number {
  return (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Best available thumbnail for a line item: the live product image first (so an updated catalogue
 * photo shows on older orders), then the snapshot stored on the order line itself.
 */
function itemImage(item: OrderItem, productImages: Record<string, string>): string | null {
  if (item.product_id) {
    const live = productImages[item.product_id];
    // Thumbnails go through the same pipeline as the storefront, so the watermarked supplier
    // original never reaches a screen.
    if (live) return productImageSrc(live);
  }
  return item.image_url ? productImageSrc(item.image_url) : null;
}

/**
 * Square product thumbnail with a muted placeholder when no image resolves, so the row layout
 * stays stable. `compact` is used in the collapsed list row; the larger default is used in the
 * detail modal (48px on phones, 56px from `sm`).
 */
function ItemThumb({ src, alt, compact = false }: { src: string | null; alt: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cream-100 ring-1 ring-charcoal/10',
        compact ? 'h-9 w-9' : 'h-12 w-12 sm:h-14 sm:w-14'
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Package className="h-4 w-4 text-charcoal/30" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * Business-day label. Dates are stored AD and stay AD in the database; the owner's
 * `nepali_dates` setting only decides how they are rendered. Passing the Kathmandu `YYYY-MM-DD`
 * (not the raw timestamp) keeps the BS day aligned with the salon's day.
 */
function dayLabel(kathmanduYmd: string, nepali: boolean): string {
  return nepali ? formatBsDate(kathmanduYmd, { withAd: true }) : formatDateLong(kathmanduYmd);
}

function statusActionLabel(status: OrderStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirm';
    case 'packed':
      return 'Mark packed';
    case 'shipped':
      return 'Mark shipped';
    case 'delivered':
      return 'Mark delivered';
    case 'cancelled':
      return 'Cancel';
    default:
      return ORDER_STATUS_LABELS[status];
  }
}

/** Icon paired with each forward action so a row button can collapse to an icon on phones. */
const NEXT_STATUS_ICONS: Partial<Record<OrderStatus, LucideIcon>> = {
  confirmed: Check,
  packed: Package,
  shipped: Truck,
  delivered: CheckCheck,
  cancelled: X,
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [businessWhatsapp, setBusinessWhatsapp] = useState('');
  const [nepaliDates, setNepaliDates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statementBusyId, setStatementBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, settings, products] = await Promise.all([
        getOrders(),
        getSalonSettings(),
        getProducts({ includeInactive: true }),
      ]);
      setOrders(rows);
      setBusinessWhatsapp(settings.whatsapp_number);
      setNepaliDates(settings.nepali_dates);

      // One products read, cached in state, keyed by id — resolves every line-item thumbnail
      // without a request per row.
      const imageById: Record<string, string> = {};
      for (const product of products) {
        if (product.image_url) imageById[product.id] = product.image_url;
      }
      setProductImages(imageById);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
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

  const setRowError = useCallback((id: string, message: string) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  /** Runs a mutation for one order, then refreshes the board. */
  const run = useCallback(
    async (id: string, action: string, fn: () => Promise<unknown>) => {
      setBusyKey(`${id}:${action}`);
      setRowError(id, '');
      try {
        await fn();
        await load();
      } catch (err) {
        setRowError(id, err instanceof Error ? err.message : 'Could not update this order.');
      } finally {
        setBusyKey(null);
      }
    },
    [load, setRowError]
  );

  /**
   * Resolves the customer's payment statement to a short-lived signed URL and opens it in a new
   * tab. The tab is opened synchronously, before the await, so the click's user-activation is not
   * lost and the browser does not treat it as a popup and block it. A null result (missing object
   * or failed signing) is reported clearly rather than opening a broken tab.
   */
  async function openPaymentStatement(order: Order) {
    const key = order.payment_proof_url;
    if (!key) return;

    const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    setRowError(order.id, '');
    setStatementBusyId(order.id);
    try {
      const url = await getPaymentProofUrl(key);
      if (!url) {
        tab?.close();
        setRowError(
          order.id,
          'Could not open the payment statement — the secure link was not created. It may have been removed, or your session may have expired.'
        );
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      tab?.close();
      setRowError(order.id, err instanceof Error ? err.message : 'Could not open the payment statement.');
    } finally {
      setStatementBusyId(null);
    }
  }

  const counts = orderStatusCounts(orders);
  const needle = search.trim().toLowerCase();

  const filtered = orders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (needle) {
      const haystack = `${order.reference} ${order.customer_name} ${order.customer_phone}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    const day = kathmanduDate(order.created_at);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });

  const detail = detailId ? orders.find((order) => order.id === detailId) ?? null : null;

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    setBusyKey(`${cancelTarget.id}:cancel`);
    try {
      await updateOrderStatus(cancelTarget.id, 'cancelled');
      setCancelTarget(null);
      await load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel this order.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Shop</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Orders</h1>
        <p className="text-sm text-charcoal-soft">
          Move each order through confirmation, packing and delivery — and send the customer a
          WhatsApp update at every step.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Order board</CardTitle>
            <CardDescription>
              {filtered.length} shown of {orders.length} orders
            </CardDescription>
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((status) => {
              const active = statusFilter === status;
              const label = status === 'all' ? 'All' : ORDER_STATUS_LABELS[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
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

          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="orders-search">
                Search
              </label>
              <Input
                id="orders-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, name or phone"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="orders-from">
                From date
              </label>
              <Input
                id="orders-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="orders-to">
                To date
              </label>
              <Input
                id="orders-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Reference</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH>Delivery area</TH>
                  <TH>Items</TH>
                  <TH>Total</TH>
                  <TH>Status</TH>
                  <TH>Payment</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={9} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading orders…
                    </TD>
                  </TR>
                ) : orders.length === 0 ? (
                  <TR>
                    <TD colSpan={9} className="py-8 text-center text-sm text-charcoal-soft">
                      No orders yet. New shop orders will appear here as they arrive.
                    </TD>
                  </TR>
                ) : filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={9} className="py-8 text-center text-sm text-charcoal-soft">
                      No orders match these filters.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((order) => {
                    const nextStatuses = NEXT_ORDER_STATUS[order.status];
                    const firstItem = (order.items ?? [])[0];
                    return (
                      <TR key={order.id} className="align-top">
                        <TD className="whitespace-nowrap font-medium text-charcoal">
                          {order.reference}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          <span className="block">
                            {dayLabel(kathmanduDate(order.created_at), nepaliDates)}
                          </span>
                          <span className="text-xs">{kathmanduTime(order.created_at)}</span>
                        </TD>
                        <TD className="min-w-[150px]">
                          <span
                            className="block max-w-[14rem] truncate font-medium text-charcoal"
                            title={order.customer_name}
                          >
                            {order.customer_name}
                          </span>
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-rose-gold transition-colors hover:underline"
                          >
                            <Phone className="h-3 w-3" aria-hidden="true" />
                            {formatPhoneDisplay(order.customer_phone)}
                          </a>
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">{order.delivery_city}</TD>
                        <TD className="text-charcoal-soft">
                          <div className="flex items-center gap-2">
                            <ItemThumb
                              compact
                              src={firstItem ? itemImage(firstItem, productImages) : null}
                              alt={firstItem?.product_name ?? 'Order item'}
                            />
                            <span className="whitespace-nowrap">
                              {itemCount(order)}
                              {itemCount(order) === 1 ? ' item' : ' items'}
                            </span>
                          </div>
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal">{formatNPR(order.total_npr)}</TD>
                        <TD>
                          <StatusBadge className={ORDER_STATUS_STYLES[order.status]}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </StatusBadge>
                        </TD>
                        <TD className="min-w-[140px]">
                          <StatusBadge className={PAYMENT_STATUS_STYLES[order.payment_status]}>
                            {PAYMENT_STATUS_LABELS[order.payment_status]}
                          </StatusBadge>
                          {order.payment_reference ? (
                            <p className="mt-1 break-all text-xs text-charcoal-soft">
                              Ref:{' '}
                              <span className="font-mono text-charcoal">{order.payment_reference}</span>
                            </p>
                          ) : null}
                        </TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailId(order.id)}
                              aria-label={`View details for ${order.reference}`}
                              className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                               <span className="hidden sm:inline">View</span>
                             </Button>

                             {order.payment_proof_url ? (
                               <Button
                                 type="button"
                                 size="sm"
                                 variant="outline"
                                 disabled={statementBusyId === order.id}
                                 onClick={() => void openPaymentStatement(order)}
                                 aria-label={`View payment statement for ${order.reference}`}
                                 className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                               >
                                 {statementBusyId === order.id ? (
                                   <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                 ) : (
                                   <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                 )}
                                 <span className="hidden sm:inline">Statement</span>
                               </Button>
                             ) : null}

                             {nextStatuses.map((next) => {
                              const Icon = NEXT_STATUS_ICONS[next] ?? Check;

                              if (next === 'cancelled') {
                                return (
                                  <Button
                                    key={next}
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-10 min-w-10 text-danger hover:bg-danger/10 sm:h-8 sm:min-w-0"
                                    disabled={busyKey !== null}
                                    onClick={() => {
                                      setCancelTarget(order);
                                      setCancelError(null);
                                    }}
                                    aria-label={`Cancel ${order.reference}`}
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span className="hidden sm:inline">Cancel</span>
                                  </Button>
                                );
                              }

                              return (
                                <Button
                                  key={next}
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={busyKey !== null}
                                  onClick={() =>
                                    void run(order.id, next, () => updateOrderStatus(order.id, next))
                                  }
                                  aria-label={`${statusActionLabel(next)} ${order.reference}`}
                                  className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                                >
                                  {busyKey === `${order.id}:${next}` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  <span className="hidden sm:inline">{statusActionLabel(next)}</span>
                                </Button>
                              );
                            })}

                            {order.status !== 'cancelled' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busyKey !== null}
                                onClick={() =>
                                  void run(order.id, 'payment', () =>
                                    updateOrder(order.id, {
                                      payment_status:
                                        order.payment_status === 'paid' ? 'unpaid' : 'paid',
                                    })
                                  )
                                }
                                aria-label={`Mark ${order.reference} ${
                                  order.payment_status === 'paid' ? 'unpaid' : 'paid'
                                }`}
                                className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                              >
                                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">
                                  {order.payment_status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                                </span>
                              </Button>
                            ) : null}

                            {order.status !== 'pending' ? (
                              <a
                                href={createOrderStatusLink({
                                  customer_phone: order.customer_phone,
                                  customer_name: order.customer_name,
                                  reference: order.reference,
                                  status: order.status,
                                  total_npr: order.total_npr,
                                  delivery_city: order.delivery_city,
                                  business_whatsapp: businessWhatsapp,
                                })}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  buttonVariants({ size: 'sm', variant: 'outline' }),
                                  'h-10 min-w-10 justify-center sm:h-8 sm:min-w-0'
                                )}
                                aria-label={`WhatsApp ${order.reference} customer`}
                              >
                                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </a>
                            ) : null}
                          </div>
                          {rowErrors[order.id] ? (
                            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                              {rowErrors[order.id]}
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

      <Modal
        open={detail !== null}
        onClose={() => setDetailId(null)}
        size="lg"
        title={detail ? `Order ${detail.reference}` : 'Order'}
        description={detail ? dayLabel(kathmanduDate(detail.created_at), nepaliDates) : undefined}
      >
        {detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge className={ORDER_STATUS_STYLES[detail.status]}>
                {ORDER_STATUS_LABELS[detail.status]}
              </StatusBadge>
              <StatusBadge className={PAYMENT_STATUS_STYLES[detail.payment_status]}>
                {PAYMENT_STATUS_LABELS[detail.payment_status]}
              </StatusBadge>
              <span className="text-xs text-charcoal-soft">
                {PAYMENT_METHOD_LABELS[detail.payment_method]}
              </span>
            </div>

            {detail.payment_reference || detail.payment_proof_url ? (
              <div className="space-y-2 rounded-xl bg-cream-100 px-3 py-2.5 text-sm">
                <p className="eyebrow">Payment</p>
                {detail.payment_reference ? (
                  <p className="break-all text-charcoal">
                    Transaction reference:{' '}
                    <span className="font-mono">{detail.payment_reference}</span>
                  </p>
                ) : null}
                {detail.payment_proof_url ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={statementBusyId === detail.id}
                    onClick={() => void openPaymentStatement(detail)}
                    className="h-10 sm:h-8"
                  >
                    {statementBusyId === detail.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    View payment statement
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="eyebrow">Customer</p>
                <p className="break-words font-medium text-charcoal">{detail.customer_name}</p>
                <a href={`tel:${detail.customer_phone}`} className="text-rose-gold hover:underline">
                  {formatPhoneDisplay(detail.customer_phone)}
                </a>
                {detail.customer_email ? (
                  <p className="break-all text-charcoal-soft">{detail.customer_email}</p>
                ) : null}
              </div>
              <div className="space-y-1 text-sm">
                <p className="eyebrow">Delivery</p>
                <p className="break-words text-charcoal">{detail.delivery_address}</p>
                <p className="text-charcoal-soft">{detail.delivery_city}</p>
                {detail.delivery_landmark ? (
                  <p className="break-words text-charcoal-soft">Landmark: {detail.delivery_landmark}</p>
                ) : null}
              </div>
            </div>

            {detail.notes ? (
              <div className="space-y-1 text-sm">
                <p className="eyebrow">Notes</p>
                <p className="rounded-xl bg-cream-100 px-3 py-2 text-charcoal">{detail.notes}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="eyebrow">Items</p>
              <div className="divide-y divide-charcoal/10 rounded-xl border border-charcoal/10">
                {(detail.items ?? []).length === 0 ? (
                  <p className="px-3 py-4 text-sm text-charcoal-soft">No line items recorded.</p>
                ) : (
                  (detail.items ?? []).map((item) => (
                    <div key={item.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <ItemThumb src={itemImage(item, productImages)} alt={item.product_name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <p className="min-w-0 break-words font-medium text-charcoal">
                            {item.product_name}
                          </p>
                          <p className="whitespace-nowrap font-medium text-charcoal">
                            {formatNPR(item.line_total_npr)}
                          </p>
                        </div>
                        <p className="break-words text-xs text-charcoal-soft">
                          {item.variant ? `${item.variant} · ` : ''}
                          {formatNPR(item.unit_price_npr)} × {item.quantity}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-charcoal-soft">
                <span>Subtotal</span>
                <span>{formatNPR(detail.subtotal_npr)}</span>
              </div>
              <div className="flex justify-between text-charcoal-soft">
                <span>Shipping</span>
                <span>{formatNPR(detail.shipping_npr)}</span>
              </div>
              <div className="flex justify-between border-t border-charcoal/10 pt-1 font-medium text-charcoal">
                <span>Total</span>
                <span>{formatNPR(detail.total_npr)}</span>
              </div>
            </div>

            <div className="grid gap-1 text-xs text-charcoal-soft">
              <p>
                Placed {dayLabel(kathmanduDate(detail.created_at), nepaliDates)} ·{' '}
                {kathmanduTime(detail.created_at)}
              </p>
              <p>
                Updated {dayLabel(kathmanduDate(detail.updated_at), nepaliDates)} ·{' '}
                {kathmanduTime(detail.updated_at)}
              </p>
            </div>

            {/* Stays pinned to the bottom of the scrolling dialog so the close action is always one
                thumb-tap away on a phone; 40px tall to stay an easy touch target. */}
            <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDetailId(null)}
                className="h-10 w-full sm:w-auto"
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        size="sm"
        title="Cancel order"
        description={
          cancelTarget ? `Cancel “${cancelTarget.reference}” for ${cancelTarget.customer_name}?` : undefined
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Cancelling returns every reserved unit in this order to the catalogue in the same
            transaction, so the stock becomes available to other customers immediately.
          </p>
          {cancelError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {cancelError}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={busyKey !== null}
              className="w-full sm:w-auto"
            >
              Keep order
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmCancel()}
              loading={busyKey !== null}
              className="w-full sm:w-auto"
            >
              Cancel order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
