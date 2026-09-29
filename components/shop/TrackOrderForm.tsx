'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ORDER_PIPELINE, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from '@/lib/commerce';
import { formatBsDate } from '@/lib/nepali-date';
import { cn, formatDateLong, formatNPR, isValidNepaliPhone } from '@/lib/utils';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/types/commerce.types';

interface LookupOrder {
  reference: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  delivery_city: string;
  subtotal_npr: number;
  shipping_npr: number;
  total_npr: number;
  created_at: string;
  items: { name: string; variant: string | null; quantity: number; line_total_npr: number }[];
}

interface LookupResponse {
  ok: boolean;
  order?: LookupOrder;
  error?: string;
}

function StatusTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="rounded-xl bg-danger/5 p-4 text-sm text-danger">
        This order was cancelled. If that was not expected, message us on WhatsApp and we will sort
        it out.
      </div>
    );
  }

  const currentIndex = ORDER_PIPELINE.indexOf(status);

  return (
    <ol className="flex flex-wrap gap-2">
      {ORDER_PIPELINE.map((step, index) => {
        const done = index <= currentIndex;
        const current = index === currentIndex;
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset',
              done
                ? 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25'
                : 'bg-charcoal/5 text-charcoal-soft ring-charcoal/10'
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                done ? 'bg-rose-gold text-white' : 'bg-charcoal/10 text-charcoal-soft'
              )}
            >
              {index + 1}
            </span>
            {ORDER_STATUS_LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}

/** Customer-facing order tracker: reference + phone against `GET /api/orders`. */
export function TrackOrderForm({
  initialReference = '',
  nepaliDates = false,
}: {
  initialReference?: string;
  /** When true, order dates are shown in Bikram Sambat alongside AD. */
  nepaliDates?: boolean;
}) {
  const [reference, setReference] = React.useState(initialReference);
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<LookupOrder | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOrder(null);

    const trimmedReference = reference.trim();
    if (!trimmedReference) {
      setError('Enter your order reference (it looks like ABH-ORD-XXXXXX).');
      return;
    }
    if (!isValidNepaliPhone(phone)) {
      setError('Enter the 10-digit mobile number used for the order.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/orders?reference=${encodeURIComponent(trimmedReference)}&phone=${encodeURIComponent(phone.trim())}`
      );

      if (response.status === 400) {
        setError('Please check the reference format and mobile number, then try again.');
        return;
      }
      if (response.status === 404) {
        setError('No order matches that reference and mobile number.');
        return;
      }

      const data = (await response.json().catch(() => null)) as LookupResponse | null;
      if (!response.ok || !data?.ok || !data.order) {
        setError(data?.error ?? 'We could not look up that order. Please try again.');
        return;
      }

      setOrder(data.order);
    } catch {
      setError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="space-y-5 p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Order reference" htmlFor="track-reference">
            <Input
              id="track-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="ABH-ORD-XXXXXX"
              autoComplete="off"
              required
            />
          </Field>

          <Field
            label="Mobile number"
            htmlFor="track-phone"
            hint="The number you used at checkout."
          >
            <Input
              id="track-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="98XXXXXXXX"
              autoComplete="tel"
              aria-invalid={Boolean(error)}
              required
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full sm:w-auto">
            <Search className="h-5 w-5" aria-hidden="true" />
            {loading ? 'Looking up…' : 'Track order'}
          </Button>
        </form>
      </Card>

      {order && (
        <Card className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-charcoal-soft">Order</p>
              <h2 className="font-display text-xl text-charcoal">{order.reference}</h2>
              <p className="mt-0.5 text-xs text-charcoal-soft">
                Placed{' '}
                {nepaliDates
                  ? formatBsDate(order.created_at, { withAd: true })
                  : formatDateLong(order.created_at.slice(0, 10))}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
                ORDER_STATUS_STYLES[order.status]
              )}
            >
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>

          <StatusTimeline status={order.status} />

          <p className="text-sm text-charcoal-soft">Delivering to {order.delivery_city}</p>

          <ul className="space-y-3">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-charcoal">
                  {item.name}
                  {item.variant ? <span className="text-charcoal-soft"> · {item.variant}</span> : null}
                  <span className="block text-xs text-charcoal-soft">Qty {item.quantity}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-medium text-price">
                  {formatNPR(item.line_total_npr)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-charcoal/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-charcoal-soft">Subtotal</dt>
              <dd className="font-medium text-price">{formatNPR(order.subtotal_npr)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-charcoal-soft">Delivery</dt>
              <dd className="font-medium text-price">
                {order.shipping_npr === 0 ? 'Free' : formatNPR(order.shipping_npr)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-charcoal/10 pt-2 text-base">
              <dt className="font-medium text-charcoal">Total</dt>
              <dd className="font-display text-xl text-price">{formatNPR(order.total_npr)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {!order && !error && (
        <div className="panel flex items-start gap-3 p-5 text-sm text-charcoal-soft">
          <Package className="mt-0.5 h-5 w-5 shrink-0 text-rose-gold" aria-hidden="true" />
          <p>
            Enter the reference from your confirmation screen together with the mobile number you
            used. Still stuck?{' '}
            <Link href="/contact" className="text-rose-gold underline underline-offset-4">
              Contact us
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
