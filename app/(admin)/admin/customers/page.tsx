'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Phone } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getCustomers, getOrders } from '@/lib/shop-admin-api';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from '@/lib/commerce';
import { cn, formatDateLong, formatNPR, formatPhoneDisplay, to12Hour, todayISO } from '@/lib/utils';
import type { CustomerSummary, Order } from '@/types/commerce.types';

type SortKey = 'spend' | 'recent' | 'orders';

const SORT_LABELS: Record<SortKey, string> = {
  spend: 'Highest spend',
  recent: 'Most recent order',
  orders: 'Most orders',
};

function kathmanduDate(iso: string): string {
  return todayISO(new Date(iso));
}

function kathmanduTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return to12Hour(parts);
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('spend');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summaries, rows] = await Promise.all([getCustomers(), getOrders()]);
      setCustomers(summaries);
      setOrders(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load customers.');
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = customers.filter((customer) => {
      if (!needle) return true;
      return (
        customer.name.toLowerCase().includes(needle) ||
        customer.phone.toLowerCase().includes(needle)
      );
    });

    return rows.sort((a, b) => {
      switch (sort) {
        case 'recent':
          return b.last_order_at.localeCompare(a.last_order_at);
        case 'orders':
          return b.order_count - a.order_count || b.total_spent_npr - a.total_spent_npr;
        default:
          return b.total_spent_npr - a.total_spent_npr;
      }
    });
  }, [customers, search, sort]);

  const selected = selectedPhone
    ? customers.find((customer) => customer.phone === selectedPhone) ?? null
    : null;

  const selectedOrders = useMemo(
    () =>
      selectedPhone
        ? orders
            .filter((order) => order.customer_phone === selectedPhone)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
        : [],
    [orders, selectedPhone]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Shop</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Customers</h1>
        <p className="text-sm text-charcoal-soft">
          Everyone who has ordered from the shop, rolled up by phone number. Select a customer to
          see their order history.
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
            <CardTitle>Customer list</CardTitle>
            <CardDescription>
              {filtered.length} shown of {customers.length} customers
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="customers-search">
                Search
              </label>
              <Input
                id="customers-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or phone"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="customers-sort">
                Sort by
              </label>
              <Select
                id="customers-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Delivery area</TH>
                  <TH>Orders</TH>
                  <TH>Lifetime spend</TH>
                  <TH>Last order</TH>
                  <TH>History</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading customers…
                    </TD>
                  </TR>
                ) : customers.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-sm text-charcoal-soft">
                      No customers yet. They appear here once orders come in.
                    </TD>
                  </TR>
                ) : filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-sm text-charcoal-soft">
                      No customers match this search.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((customer) => {
                    const active = selectedPhone === customer.phone;
                    return (
                      <TR key={customer.phone} className={cn(active && 'bg-blush-50')}>
                        <TD className="min-w-[160px]">
                          <span
                            className="block max-w-[12rem] truncate font-medium text-charcoal"
                            title={customer.name}
                          >
                            {customer.name}
                          </span>
                          <a
                            href={`tel:${customer.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-rose-gold transition-colors hover:underline"
                          >
                            <Phone className="h-3 w-3" aria-hidden="true" />
                            {formatPhoneDisplay(customer.phone)}
                          </a>
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">{customer.city}</TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">{customer.order_count}</TD>
                        <TD className="whitespace-nowrap font-medium text-charcoal">
                          {formatNPR(customer.total_spent_npr)}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {formatDateLong(kathmanduDate(customer.last_order_at))}
                        </TD>
                        <TD>
                          <button
                            type="button"
                            onClick={() => setSelectedPhone(active ? null : customer.phone)}
                            aria-expanded={active}
                            aria-label={`${active ? 'Hide' : 'Show'} orders for ${customer.name}`}
                            className={cn(
                              buttonVariants({ size: 'sm', variant: active ? 'secondary' : 'outline' }),
                              'h-10 min-w-10 sm:h-8 sm:min-w-0'
                            )}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">{active ? 'Hide orders' : 'View orders'}</span>
                          </button>
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

      {selected ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{selected.name}</CardTitle>
              <CardDescription>
                {selected.order_count} {selected.order_count === 1 ? 'order' : 'orders'} ·{' '}
                {formatNPR(selected.total_spent_npr)} lifetime
              </CardDescription>
            </div>
            <Link href="/admin/orders" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              Open orders
            </Link>
          </CardHeader>
          <CardContent>
            {selectedOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-8 text-center text-sm text-charcoal-soft">
                No orders found for this customer.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-charcoal/10 bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal">{order.reference}</p>
                      <p className="text-xs text-charcoal-soft">
                        {formatDateLong(kathmanduDate(order.created_at))} ·{' '}
                        {kathmanduTime(order.created_at)} · {formatNPR(order.total_npr)}
                      </p>
                    </div>
                    <StatusBadge className={ORDER_STATUS_STYLES[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
