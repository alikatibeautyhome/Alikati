'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut, Package, UserCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/components/account/AuthProvider';
import { getMyOrders, updateCustomerProfile } from '@/lib/customer-api';
import { DELIVERY_CITIES, ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from '@/lib/commerce';
import { formatBsDate } from '@/lib/nepali-date';
import { cn, formatDateLong, formatNPR, isValidNepaliPhone } from '@/lib/utils';
import type { Order } from '@/types/commerce.types';

function itemCount(order: Order): number {
  return (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * The customer dashboard: greeting, editable profile and order history.
 *
 * Rendered without a session it shows a friendly prompt instead of redirecting — the storefront
 * never forces a customer to sign in.
 */
export function AccountDashboard({ nepaliDates = false }: { nepaliDates?: boolean }) {
  const { customer, loading, refresh, signOut } = useAuth();

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('');

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState(false);

  // Seed the profile form whenever the signed-in customer changes.
  React.useEffect(() => {
    setFullName(customer?.full_name ?? '');
    setPhone(customer?.phone ?? '');
    setAddress(customer?.default_address ?? '');
    setCity(customer?.default_city ?? '');
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});
  }, [customer]);

  React.useEffect(() => {
    let active = true;

    if (!customer) {
      setOrders([]);
      setOrdersLoading(false);
      return () => {
        active = false;
      };
    }

    setOrdersLoading(true);
    void (async () => {
      try {
        const rows = await getMyOrders();
        if (active) setOrders(rows);
      } catch {
        if (active) setOrders([]);
      } finally {
        if (active) setOrdersLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [customer]);

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSaved(false);

    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) errors.full_name = 'Please enter your full name.';
    if (phone.trim() && !isValidNepaliPhone(phone.trim())) {
      errors.phone = 'Enter a valid 10-digit Nepali mobile number, or leave it blank.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError('Please check the highlighted fields.');
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await updateCustomerProfile({
        full_name: fullName.trim(),
        phone: phone.trim() ? phone.trim() : null,
        default_address: address.trim() ? address.trim() : null,
        default_city: city ? city : null,
      });
      await refresh();
      setSaved(true);
    } catch {
      setSaveError('We could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="panel p-10 text-center text-charcoal-soft">Loading your account…</div>;
  }

  if (!customer) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
          <UserCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl text-charcoal">Your account</h1>
        <p className="mt-2 text-sm text-charcoal-soft">
          Sign in to see your orders and saved delivery details. No account? You can keep shopping
          as a guest — it is entirely optional.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/account/login" className={buttonVariants({ size: 'lg' })}>
            Sign in
          </Link>
          <Link href="/account/signup" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Create an account
          </Link>
        </div>
        <p className="mt-4 text-xs text-charcoal-soft">
          <Link href="/shop" className="text-rose-gold hover:underline">
            Continue browsing the shop
          </Link>
        </p>
      </div>
    );
  }

  const firstName = customer.full_name.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-1 font-display text-3xl text-charcoal sm:text-4xl">Namaste, {firstName}!</h1>
          <p className="mt-1 text-sm text-charcoal-soft">Signed in as {customer.email}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* ── order history ─────────────────────────────────────────────── */}
        <section id="orders" className="space-y-4 scroll-mt-24">
          <h2 className="font-display text-xl text-charcoal">Order history</h2>

          {ordersLoading ? (
            <div className="panel p-6 text-center text-sm text-charcoal-soft">Loading your orders…</div>
          ) : orders.length === 0 ? (
            <div className="panel p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
                <Package className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 font-display text-lg text-charcoal">No orders yet</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                When you place an order it will appear here with its live status.
              </p>
              <Link href="/shop" className={buttonVariants({ className: 'mt-5' })}>
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <li key={order.id}>
                  <Card className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-display text-lg text-charcoal">{order.reference}</p>
                        <p className="text-xs text-charcoal-soft">
                          {nepaliDates
                            ? formatBsDate(order.created_at, { withAd: true })
                            : formatDateLong(order.created_at.slice(0, 10))}{' '}
                          · {itemCount(order)} item{itemCount(order) === 1 ? '' : 's'} ·{' '}
                          {order.delivery_city}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                          ORDER_STATUS_STYLES[order.status]
                        )}
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="font-display text-lg text-price">{formatNPR(order.total_npr)}</p>
                      <Link
                        href={`/order/${order.reference}`}
                        className="text-sm font-medium text-rose-gold hover:underline"
                      >
                        View order
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── profile ───────────────────────────────────────────────────── */}
        <Card className="p-5 sm:p-6 lg:sticky lg:top-24">
          <CardContent className="space-y-4 p-0">
            <div>
              <h2 className="font-display text-xl text-charcoal">Your details</h2>
              <p className="mt-1 text-xs text-charcoal-soft">
                Saved here and pre-filled at checkout next time.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <Field label="Full name" htmlFor="account-name" error={fieldErrors.full_name}>
                <Input
                  id="account-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  aria-invalid={Boolean(fieldErrors.full_name)}
                  required
                />
              </Field>

              <Field label="Mobile number" htmlFor="account-phone" error={fieldErrors.phone}>
                <Input
                  id="account-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
              </Field>

              <Field label="Default address" htmlFor="account-address">
                <Textarea
                  id="account-address"
                  rows={2}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  autoComplete="street-address"
                  placeholder="Ward, street or tole, landmark…"
                />
              </Field>

              <Field label="Default area" htmlFor="account-city">
                <Select
                  id="account-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                >
                  <option value="">Choose an area</option>
                  {DELIVERY_CITIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              {saveError ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {saveError}
                </p>
              ) : null}
              {saved ? (
                <p role="status" className="text-sm font-medium text-success">
                  Details saved. Dhanyabad!
                </p>
              ) : null}

              <Button type="submit" loading={saving} className="w-full">
                Save details
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
