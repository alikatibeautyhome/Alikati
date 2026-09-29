'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { AppointmentRow } from '@/components/admin/AppointmentRow';
import { StatTile } from '@/components/admin/StatTile';
import { StatusBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, TBody, TH, THead, TR } from '@/components/ui/table';
import { getAppointmentsByDate, getDailyKpis, getSalonSettings } from '@/lib/api-client';
import { getAffiliates, getCoupons } from '@/lib/marketing-api';
import { formatBsDate } from '@/lib/nepali-date';
import { getOrders, getProducts, getShopKpis } from '@/lib/shop-admin-api';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, isLowStock, stockLabel } from '@/lib/commerce';
import { cn, formatDateLong, formatNPR, formatNPRCompact, todayISO } from '@/lib/utils';
import type { Appointment, DailyKpis } from '@/types/database.types';
import type { Order, Product, ShopKpis } from '@/types/commerce.types';

/** Today's heading honouring the owner's Bikram Sambat preference. */
function dayHeading(ymd: string, nepali: boolean): string {
  return nepali ? formatBsDate(ymd, { withAd: true }) : formatDateLong(ymd);
}

export default function AdminDashboardPage() {
  const today = todayISO();

  const [kpis, setKpis] = useState<DailyKpis | null>(null);
  const [nepaliDates, setNepaliDates] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shopKpis, setShopKpis] = useState<ShopKpis | null>(null);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [shopError, setShopError] = useState<string | null>(null);
  const [marketingStats, setMarketingStats] = useState<{
    activeCouponCodes: number;
    affiliateCommissionMonth: number;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextKpis, queue] = await Promise.all([
        getDailyKpis(today),
        getAppointmentsByDate(today),
      ]);
      setKpis(nextKpis);
      setAppointments(queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load today\u2019s dashboard.');
    }
  }, [today]);

  // Shop figures are fetched separately so a store-side hiccup never blanks the salon dashboard.
  const loadShop = useCallback(async () => {
    setShopError(null);
    try {
      const [nextShopKpis, orderRows, productRows] = await Promise.all([
        getShopKpis(),
        getOrders(),
        getProducts({ includeInactive: false }),
      ]);
      setShopKpis(nextShopKpis);
      setPendingOrders(orderRows.filter((order) => order.status === 'pending').slice(0, 5));
      setLowStockProducts(productRows.filter((product) => isLowStock(product)).slice(0, 5));

      // Marketing tiles are isolated: if coupons or affiliates fail to load, the retail tiles
      // above stay intact and the marketing tiles fall back to a dash.
      try {
        const [couponRows, affiliateRows] = await Promise.all([getCoupons(), getAffiliates()]);

        // An order only counts when its referral code belongs to the programme, so stray or
        // legacy codes are ignored rather than inflating the figure.
        const programmeCodes = new Set(affiliateRows.map((affiliate) => affiliate.code.toUpperCase()));
        const monthPrefix = today.slice(0, 7);
        const affiliateCommissionMonth = orderRows
          .filter((order) => order.status !== 'cancelled')
          .filter((order) => order.created_at.slice(0, 7) === monthPrefix)
          .filter((order) => {
            const code = order.affiliate_code?.toUpperCase();
            return code ? programmeCodes.has(code) : false;
          })
          .reduce((sum, order) => sum + Number(order.commission_npr ?? 0), 0);

        setMarketingStats({
          activeCouponCodes: couponRows.filter((coupon) => coupon.is_active).length,
          affiliateCommissionMonth,
        });
      } catch {
        setMarketingStats(null);
      }
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Could not load the shop figures.');
    }
  }, [today]);

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

  // Initial load + 60-second auto-refresh.
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([load(), loadShop()]).finally(() => {
      if (active) setLoading(false);
    });
    const timer = window.setInterval(() => {
      void load();
      void loadShop();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load, loadShop]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadShop()]);
    setRefreshing(false);
  }, [load, loadShop]);

  const tiles = kpis
    ? [
        { label: 'Total bookings', value: String(kpis.total), tone: 'neutral' as const },
        { label: 'Pending', value: String(kpis.pending), tone: 'pending' as const },
        { label: 'Confirmed', value: String(kpis.confirmed), tone: 'confirmed' as const },
        { label: 'In Progress', value: String(kpis.inProgress), tone: 'progress' as const },
        {
          label: 'Projected revenue',
          value: formatNPR(kpis.projectedRevenue),
          tone: 'revenue' as const,
          subLabel: 'Excludes cancelled',
        },
        {
          label: 'Realised revenue',
          value: formatNPR(kpis.realisedRevenue),
          tone: 'completed' as const,
          subLabel: 'Completed only',
        },
      ]
    : [];

  const shopTiles = shopKpis
    ? [
        { label: 'Orders today', value: String(shopKpis.ordersToday), tone: 'neutral' as const },
        {
          label: 'Revenue today',
          value: formatNPRCompact(shopKpis.revenueToday),
          tone: 'revenue' as const,
          subLabel: 'Excludes cancelled',
        },
        { label: 'Pending orders', value: String(shopKpis.ordersPending), tone: 'pending' as const },
        {
          label: 'Awaiting fulfilment',
          value: String(shopKpis.ordersAwaitingFulfilment),
          tone: 'progress' as const,
          subLabel: 'Packed or shipped',
        },
        { label: 'Low-stock items', value: String(shopKpis.lowStockCount), tone: 'confirmed' as const },
        {
          label: 'Units sold this month',
          value: String(shopKpis.unitsSoldThisMonth),
          tone: 'completed' as const,
          subLabel: 'Live orders only',
        },
      ]
    : [];

  // Marketing figures. A dash is shown until the data resolves rather than inventing a number.
  const marketingTiles = [
    {
      label: 'Active coupons',
      value: marketingStats ? String(marketingStats.activeCouponCodes) : '—',
      tone: 'progress' as const,
      subLabel: 'Codes live now',
    },
    {
      label: 'Affiliate commission',
      value: marketingStats ? formatNPRCompact(marketingStats.affiliateCommissionMonth) : '—',
      tone: 'revenue' as const,
      subLabel: 'This month',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Today at the salon</h1>
          <p className="text-sm text-charcoal-soft">{dayHeading(today, nepaliDates)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
          <Link href="/admin/appointments" className={buttonVariants({ size: 'sm' })}>
            Manage bookings
          </Link>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {loading && !kpis
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[104px] animate-pulse-soft rounded-2xl border border-charcoal/10 bg-white/60"
              />
            ))
          : tiles.map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={tile.value}
                tone={tile.tone}
                subLabel={tile.subLabel}
              />
            ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Shop</p>
            <h2 className="mt-1 font-display text-xl text-charcoal">Retail at a glance</h2>
          </div>
          <Link href="/admin/orders" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Manage orders
          </Link>
        </div>

        {shopError ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {shopError}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading && !shopKpis
            ? Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[104px] animate-pulse-soft rounded-2xl border border-charcoal/10 bg-white/60"
                />
              ))
            : [...shopTiles, ...marketingTiles].map((tile) => (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  tone={tile.tone}
                  subLabel={tile.subLabel}
                />
              ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>The newest pending orders and products running low.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">Pending orders</p>
                <Link
                  href="/admin/orders"
                  className="text-xs font-medium text-rose-gold hover:underline"
                >
                  View all
                </Link>
              </div>
              {pendingOrders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-3 py-6 text-center text-sm text-charcoal-soft">
                  No pending orders — the shop queue is clear.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pendingOrders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href="/admin/orders"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-charcoal/10 bg-white px-3 py-2.5 transition-colors hover:border-rose-gold/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-charcoal">
                            {order.reference}
                          </span>
                          <span className="block truncate text-xs text-charcoal-soft">
                            {order.customer_name} · {formatNPR(order.total_npr)}
                          </span>
                        </span>
                        <StatusBadge className={ORDER_STATUS_STYLES[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </StatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">Low stock</p>
                <Link
                  href="/admin/products"
                  className="text-xs font-medium text-rose-gold hover:underline"
                >
                  Manage products
                </Link>
              </div>
              {lowStockProducts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-3 py-6 text-center text-sm text-charcoal-soft">
                  Everything is well stocked.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lowStockProducts.map((product) => (
                    <li key={product.id}>
                      <Link
                        href="/admin/products"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-charcoal/10 bg-white px-3 py-2.5 transition-colors hover:border-rose-gold/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-charcoal">
                            {product.name}
                          </span>
                          <span className="block truncate text-xs text-charcoal-soft">
                            {product.sku ?? 'No SKU'}
                          </span>
                        </span>
                        <StatusBadge className="bg-warn/10 text-warn ring-warn/25">
                          {stockLabel(product)}
                        </StatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Today&apos;s queue</CardTitle>
            <CardDescription>
              {appointments.length} {appointments.length === 1 ? 'booking' : 'bookings'} ·{' '}
              {dayHeading(today, nepaliDates)}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {loading && appointments.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse-soft rounded-xl bg-charcoal/5" />
              ))}
            </div>
          ) : appointments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">No bookings today yet.</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Walk-ins and new online bookings will appear here as they arrive.
              </p>
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
                    <TH>Quick actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {appointments.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      compact
                      onChange={() => void handleRefresh()}
                    />
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
