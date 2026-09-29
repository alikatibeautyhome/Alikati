'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, MessageCircle, Paperclip, Search } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ORDER_PIPELINE, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from '@/lib/commerce';
import { formatBsDate } from '@/lib/nepali-date';
import { productImageSrc } from '@/lib/product-image';
import { cn, formatDateLong, formatNPR, isValidNepaliPhone } from '@/lib/utils';
import type { OrderLineMedia } from '@/lib/order-media';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/types/commerce.types';

const PRODUCT_PLACEHOLDER = '/media/placeholder-product.svg';

/** One line item on the confirmation screen, with an optional product id for image matching. */
interface ConfirmedItem {
  name: string;
  variant: string | null;
  quantity: number;
  line_total_npr: number;
  product_id?: string | null;
}

/** Lookup keys used to pair a line item with its server-fetched thumbnail. */
type MediaMap = Record<string, string>;

function buildMediaMap(media: OrderLineMedia[]): MediaMap {
  const map: MediaMap = {};
  for (const line of media) {
    if (!line.image_url) continue;
    map[`${line.name}::${line.variant ?? ''}`] = line.image_url;
    if (line.product_id) map[`id:${line.product_id}`] = line.image_url;
    if (!(line.name in map)) map[line.name] = line.image_url;
  }
  return map;
}

function imageForItem(item: ConfirmedItem, media: MediaMap): string | null {
  const found =
    (item.product_id ? media[`id:${item.product_id}`] : undefined) ??
    media[`${item.name}::${item.variant ?? ''}`] ??
    media[item.name] ??
    null;

  // Same processing endpoint as the storefront: white canvas, no supplier watermark, salon mark.
  return found ? productImageSrc(found) : null;
}

interface OrderSnapshot {
  reference: string;
  status: OrderStatus;
  created_at: string;
  customer_name: string;
  delivery_city: string;
  payment_method: PaymentMethod;
  /** Transaction id the customer typed in, and whether a statement was attached. */
  payment_reference?: string | null;
  payment_proof_url?: string | null;
  subtotal_npr: number;
  discount_npr?: number;
  coupon_code?: string | null;
  shipping_npr: number;
  total_npr: number;
  whatsapp_url: string | null;
  items: ConfirmedItem[];
}

/**
 * Order date, in Bikram Sambat alongside AD when the owner has Nepali dates on (the default),
 * and as a plain AD date when they are switched off.
 */
function OrderDate({ value, nepali }: { value: string; nepali: boolean }) {
  if (nepali) return <>{formatBsDate(value, { withAd: true })}</>;
  return <>{formatDateLong(value.slice(0, 10))}</>;
}

interface LookupOrder {
  reference: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  delivery_city: string;
  subtotal_npr: number;
  discount_npr?: number;
  shipping_npr: number;
  total_npr: number;
  created_at: string;
  items: ConfirmedItem[];
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
              done ? 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25' : 'bg-charcoal/5 text-charcoal-soft ring-charcoal/10'
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

function OrderItemList({
  items,
  subtotal,
  shipping,
  total,
  discount = 0,
  couponCode = null,
  media = {},
}: {
  items: ConfirmedItem[];
  subtotal: number;
  shipping: number;
  total: number;
  /** Server-confirmed coupon discount, when one was applied. */
  discount?: number;
  couponCode?: string | null;
  /** Thumbnail URL per item, keyed by product id / name · variant. */
  media?: MediaMap;
}) {
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((item, index) => {
          const thumbnail = imageForItem(item, media);
          return (
            <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-start gap-3">
                <span className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-charcoal/10 bg-blush-50">
                  <Image
                    src={thumbnail ?? PRODUCT_PLACEHOLDER}
                    alt={item.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 break-words text-charcoal">
                  {item.name}
                  {item.variant ? <span className="text-charcoal-soft"> · {item.variant}</span> : null}
                  <span className="block text-xs text-charcoal-soft">Qty {item.quantity}</span>
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-medium text-price">
                {formatNPR(item.line_total_npr)}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="space-y-2 border-t border-charcoal/10 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-charcoal-soft">Subtotal</dt>
          <dd className="font-medium text-price">{formatNPR(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-charcoal-soft">Delivery</dt>
          <dd className="font-medium text-price">{shipping === 0 ? 'Free' : formatNPR(shipping)}</dd>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between">
            <dt className="min-w-0 break-words text-charcoal-soft">
              Discount{couponCode ? ` (${couponCode})` : ''}
            </dt>
            <dd className="shrink-0 whitespace-nowrap font-medium text-success">
              −{formatNPR(discount)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-charcoal/10 pt-2 text-base">
          <dt className="font-medium text-charcoal">Total</dt>
          <dd className="font-display text-xl text-price">{formatNPR(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Post-checkout confirmation. Prefers the snapshot the checkout flow stored in sessionStorage;
 * when the link is opened fresh (or shared), it falls back to a reference + phone lookup against
 * `GET /api/orders`.
 */
export function OrderConfirmation({
  reference,
  nepaliDates = false,
  media = [],
}: {
  reference: string;
  /** When true, Bikram Sambat dates are shown alongside AD (`settings.nepali_dates`). */
  nepaliDates?: boolean;
  /** Product thumbnails for the order's lines, read server-side by `lib/order-media.ts`. */
  media?: OrderLineMedia[];
}) {
  const mediaByKey = React.useMemo(() => buildMediaMap(media), [media]);

  const [snapshot, setSnapshot] = React.useState<OrderSnapshot | null>(null);
  const [ready, setReady] = React.useState(false);

  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [looked, setLooked] = React.useState<LookupOrder | null>(null);

  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('abh_last_order');
      if (raw) {
        const parsed = JSON.parse(raw) as OrderSnapshot;
        if (parsed.reference === reference) setSnapshot(parsed);
      }
    } catch {
      // Ignore unreadable/absent snapshots and fall through to the lookup form.
    }
    setReady(true);
  }, [reference]);

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLooked(null);

    if (!isValidNepaliPhone(phone)) {
      setError('Enter the 10-digit mobile number used for this order.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/orders?reference=${encodeURIComponent(reference)}&phone=${encodeURIComponent(phone.trim())}`
      );

      if (response.status === 400) {
        setError('Please check the reference and mobile number and try again.');
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

      setLooked(data.order);
    } catch {
      setError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return <div className="panel p-10 text-center text-charcoal-soft">Loading order…</div>;
  }

  if (snapshot) {
    return (
      <div className="space-y-6">
        <div className="panel bg-blush-50 p-6 text-center sm:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-2xl text-charcoal sm:text-3xl">
            Thank you — your order is placed
          </h1>
          <p className="mt-2 text-charcoal-soft">
            We have saved your order and will confirm it on WhatsApp shortly.
          </p>
          <p className="mt-4 font-display text-lg text-charcoal">
            Reference:{' '}
            <span className="text-rose-gold">{snapshot.reference}</span>
          </p>
          <div className="mt-3 flex justify-center">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
                ORDER_STATUS_STYLES[snapshot.status]
              )}
            >
              {ORDER_STATUS_LABELS[snapshot.status]}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-5 p-5 sm:p-6">
            <h2 className="font-display text-lg text-charcoal">Order progress</h2>
            <StatusTimeline status={snapshot.status} />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-charcoal-soft">Order date</dt>
                <dd className="min-w-0 break-words text-right font-medium text-charcoal">
                  <OrderDate value={snapshot.created_at} nepali={nepaliDates} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-charcoal-soft">Name</dt>
                <dd className="min-w-0 break-words text-right font-medium text-charcoal">
                  {snapshot.customer_name}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-charcoal-soft">Delivery area</dt>
                <dd className="min-w-0 break-words text-right font-medium text-charcoal">
                  {snapshot.delivery_city}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-charcoal-soft">Payment</dt>
                <dd className="min-w-0 break-words text-right font-medium text-charcoal">
                  {snapshot.payment_method === 'cod'
                    ? 'Cash on delivery'
                    : snapshot.payment_method === 'bank_transfer'
                      ? 'Bank transfer'
                      : snapshot.payment_method === 'esewa'
                        ? 'eSewa'
                        : 'Khalti'}
                </dd>
              </div>
              {snapshot.payment_reference ? (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-charcoal-soft">Transaction ID</dt>
                  <dd className="min-w-0 break-all text-right font-medium text-charcoal">
                    {snapshot.payment_reference}
                  </dd>
                </div>
              ) : null}
            </dl>

            {snapshot.payment_proof_url ? (
              <p className="flex items-start gap-2 rounded-xl bg-success/10 p-3 text-xs font-medium text-success">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Payment statement attached — we will check it against your payment.</span>
              </p>
            ) : snapshot.payment_method !== 'cod' ? (
              <p className="flex items-start gap-2 rounded-xl bg-blush-100 p-3 text-xs text-charcoal-soft">
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  No payment screenshot attached. Send it on WhatsApp with your reference and we will
                  confirm your payment.
                </span>
              </p>
            ) : null}
          </Card>

          <Card className="space-y-5 p-5 sm:p-6">
            <h2 className="font-display text-lg text-charcoal">Your items</h2>
            <OrderItemList
              items={snapshot.items}
              subtotal={snapshot.subtotal_npr}
              shipping={snapshot.shipping_npr}
              total={snapshot.total_npr}
              discount={snapshot.discount_npr ?? 0}
              couponCode={snapshot.coupon_code ?? null}
              media={mediaByKey}
            />
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {snapshot.whatsapp_url ? (
            <a
              href={snapshot.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: 'lg' })}
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Send order details on WhatsApp
            </a>
          ) : null}
          <Link href="/track-order" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Track this order
          </Link>
          <Link href="/shop" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="panel p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
          <Search className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl text-charcoal">Look up your order</h1>
        <p className="mt-2 text-sm text-charcoal-soft">
          We could not find the details for{' '}
          <span className="font-medium text-charcoal">{reference}</span> on this device. Enter the
          mobile number you used at checkout to see its status.
        </p>
      </div>

      <Card className="space-y-4 p-5 sm:p-6">
        <form onSubmit={handleLookup} className="space-y-4">
          <Field label="Mobile number" htmlFor="confirm-phone">
            <Input
              id="confirm-phone"
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

          <Button type="submit" loading={loading} className="w-full">
            {loading ? 'Looking up…' : 'Show order status'}
          </Button>
        </form>
      </Card>

      {looked && (
        <Card className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-charcoal">{looked.reference}</h2>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
                ORDER_STATUS_STYLES[looked.status]
              )}
            >
              {ORDER_STATUS_LABELS[looked.status]}
            </span>
          </div>
          <StatusTimeline status={looked.status} />
          <p className="text-sm text-charcoal-soft">
            Order date: <OrderDate value={looked.created_at} nepali={nepaliDates} />
          </p>
          <p className="text-sm text-charcoal-soft">Delivering to {looked.delivery_city}</p>
          <OrderItemList
            items={looked.items}
            subtotal={looked.subtotal_npr}
            shipping={looked.shipping_npr}
            total={looked.total_npr}
            discount={looked.discount_npr ?? 0}
            media={mediaByKey}
          />
        </Card>
      )}
    </div>
  );
}
