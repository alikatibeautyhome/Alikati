'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Truck,
  UploadCloud,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCart } from '@/components/shop/CartProvider';
import { PaymentQR } from '@/components/shop/PaymentQR';
import { useAuth } from '@/components/account/AuthProvider';
import { toOrderItems } from '@/lib/cart';
import { DELIVERY_CITIES, PAYMENT_METHOD_LABELS } from '@/lib/commerce';
import { getStoredReferralCode, validateCoupon } from '@/lib/marketing-api';
import { uploadPaymentProof } from '@/lib/shop-admin-api';
import { createCheckoutFallbackLink } from '@/lib/whatsapp';
import { formatNPR, isValidNepaliPhone, normalizeWhatsAppNumber } from '@/lib/utils';
import type { OrderResult, PaymentMethod } from '@/types/commerce.types';
import type { SalonSettings } from '@/types/database.types';
import type { CouponPreview } from '@/types/marketing.types';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** File types the private `payment-proofs` bucket accepts. */
const PROOF_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,application/pdf';

/** Exact copy shown for each failure class — kept in one place so support can quote it. */
const FAILURE_MESSAGES = {
  /** 5xx or a dropped connection: our fault, worth retrying, never the customer's. */
  server:
    'Something went wrong on our side. Your details are still here — please try again.',
  rateLimit: 'Too many attempts — please wait a minute and try again.',
  phone:
    'We could not read that number. Enter a 10-digit Nepali mobile, e.g. 9800000000.',
} as const;

/** Server field keys → the input id that carries the matching inline error. */
const FIELD_INPUT_IDS: Record<string, string> = {
  customer_name: 'checkout-name',
  customer_phone: 'checkout-phone',
  customer_email: 'checkout-email',
  delivery_address: 'checkout-address',
  delivery_city: 'checkout-city',
};

/** Server field keys with no dedicated input; their messages are surfaced in the error banner. */
const UNMAPPED_FIELD_KEYS = ['items', 'payment_method', 'customer_id'] as const;

/**
 * Normalises any way a customer might type their number — `+977 980-0000000`,
 * `9779800000000`, `09800000000` or `9800000000` — to the canonical 10-digit local form.
 *
 * Returns `''` when it cannot be read as a Nepali mobile, so callers can show one clear
 * message instead of submitting a number the server would reject.
 */
function normalizePhone(input: string): string {
  const digits = normalizeWhatsAppNumber(input).replace(/[^0-9]/g, '');
  const local = digits.startsWith('977') ? digits.slice(3) : digits;
  return isValidNepaliPhone(local) ? local : '';
}

/** Only images get a thumbnail; PDFs and HEIC files show a filename chip instead. */
function canPreviewProof(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/heic';
}

/** Builds the payment methods this shop currently offers, in a sensible order. */
function paymentOptionsFor(settings: SalonSettings): PaymentMethod[] {
  const options: PaymentMethod[] = [];
  if (settings.cod_enabled) options.push('cod');
  if (settings.bank_transfer_enabled) options.push('bank_transfer');
  // eSewa and Khalti are always offered.
  options.push('esewa', 'khalti');
  return options;
}

/**
 * Checkout: a single-column form on mobile with a sticky order summary, posting to
 * `POST /api/orders`. The server re-prices every line, so the totals here are display-only.
 */
export function CheckoutForm({ settings }: { settings: SalonSettings }) {
  const router = useRouter();
  const { lines, totals, hydrated, clear } = useCart();
  // Optional customer session — checkout works exactly the same without one.
  const { customer, signOut } = useAuth();

  const paymentOptions = React.useMemo(() => paymentOptionsFor(settings), [settings]);

  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [deliveryAddress, setDeliveryAddress] = React.useState('');
  const [deliveryCity, setDeliveryCity] = React.useState<string>(DELIVERY_CITIES[0]);
  const [deliveryLandmark, setDeliveryLandmark] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(
    () => paymentOptions[0] ?? 'cod'
  );

  // Payment proof (only for digital methods). The uploaded object key is what the order carries —
  // never the file itself and never a full URL.
  const [paymentReference, setPaymentReference] = React.useState('');
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [proofKey, setProofKey] = React.useState<string | null>(null);
  const [proofPreview, setProofPreview] = React.useState<string | null>(null);
  const [proofUploading, setProofUploading] = React.useState(false);
  const [proofError, setProofError] = React.useState<string | null>(null);
  const proofInputRef = React.useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [conflict, setConflict] = React.useState<string | null>(null);
  /** True only for a transient failure (5xx / network), which shows a "Try again" button. */
  const [retryable, setRetryable] = React.useState(false);

  // A digital method is anything the customer pays before delivery, so they can prove it.
  const isDigitalPayment = paymentMethod !== 'cod';

  // Optional coupon. `validateCoupon` is an advisory pre-check only — `place_order()` recomputes
  // the discount on the server, which is the figure we trust for the final confirmation.
  const [couponInput, setCouponInput] = React.useState('');
  const [coupon, setCoupon] = React.useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = React.useState(false);

  const appliedCode = coupon && coupon.valid ? coupon.code : null;
  const discountNpr = coupon && coupon.valid ? Math.min(coupon.discount_npr, totals.subtotal) : 0;
  const payableTotal = Math.max(0, totals.total - discountNpr);

  /**
   * WhatsApp fallback, rebuilt from the live form + cart so a failed checkout can still become a
   * real order. It carries the name, phone, address, every line with its quantity and price,
   * the coupon, transaction id, subtotal, delivery and total.
   */
  const whatsappFallbackUrl = React.useMemo(
    () =>
      createCheckoutFallbackLink({
        customer_name: customerName.trim() || '—',
        customer_phone: normalizePhone(customerPhone) || customerPhone.trim() || '—',
        delivery_address:
          [deliveryAddress.trim(), deliveryLandmark.trim()].filter(Boolean).join(', ') || '—',
        delivery_city: deliveryCity,
        business_whatsapp: settings.whatsapp_number,
        items: lines.map((line) => ({
          name: line.name,
          variant: line.variant,
          quantity: line.quantity,
          line_total_npr: line.unit_price_npr * line.quantity,
        })),
        subtotal_npr: totals.subtotal,
        shipping_npr: totals.shipping,
        discount_npr: discountNpr,
        coupon_code: appliedCode,
        payment_reference: isDigitalPayment ? paymentReference.trim() || null : null,
        notes: notes.trim() || null,
        total_npr: payableTotal,
      }),
    [
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryLandmark,
      deliveryCity,
      lines,
      totals.subtotal,
      totals.shipping,
      discountNpr,
      appliedCode,
      isDigitalPayment,
      paymentReference,
      notes,
      payableTotal,
      settings.whatsapp_number,
    ]
  );

  // Pre-fill from the customer's saved profile once, without clobbering anything they typed.
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (!customer || prefilledRef.current) return;
    prefilledRef.current = true;

    const profileCity = customer.default_city;
    setCustomerName((current) => current || customer.full_name);
    setCustomerPhone((current) => current || customer.phone || '');
    setCustomerEmail((current) => current || customer.email);
    setDeliveryAddress((current) => current || customer.default_address || '');
    if (profileCity && (DELIVERY_CITIES as readonly string[]).includes(profileCity)) {
      setDeliveryCity((current) => current || profileCity);
    }
  }, [customer]);

  // Thumbnail for the chosen screenshot; revokes the previous object URL on every change.
  React.useEffect(() => {
    if (!proofFile || !canPreviewProof(proofFile)) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  /**
   * Uploads the payment statement straight away so it is already in storage by the time the
   * order is placed. A failure never blocks checkout — the customer is told to send it on
   * WhatsApp instead, and the order simply goes through without a proof key.
   */
  async function handleProofSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    setProofFile(file);
    setProofKey(null);
    setProofError(null);
    setProofUploading(true);

    try {
      const result = await uploadPaymentProof(file);
      if (!result.ok || !result.key) {
        setProofError(
          result.error ?? 'Upload failed. You can send the screenshot on WhatsApp instead.'
        );
        return;
      }
      setProofKey(result.key);
    } catch {
      setProofError('Upload failed. You can send the screenshot on WhatsApp instead.');
    } finally {
      setProofUploading(false);
    }
  }

  function clearProof() {
    setProofFile(null);
    setProofKey(null);
    setProofError(null);
    if (proofInputRef.current) proofInputRef.current.value = '';
  }

  /** Moves focus to the first invalid input so a phone user is taken straight to the problem. */
  function focusFirstServerError(fields: Record<string, string>) {
    for (const key of Object.keys(FIELD_INPUT_IDS)) {
      if (fields[key]) {
        const el = document.getElementById(FIELD_INPUT_IDS[key]);
        if (el instanceof HTMLElement) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
      }
    }
  }

  /** Cleans the pasted number on blur, or explains — inline — why it cannot be read. */
  function handlePhoneBlur() {
    const raw = customerPhone.trim();
    if (!raw) return;

    const normalised = normalizePhone(raw);
    if (normalised) {
      setCustomerPhone(normalised);
      setFieldErrors((prev) => {
        if (!prev.customer_phone) return prev;
        const next = { ...prev };
        delete next.customer_phone;
        return next;
      });
      return;
    }

    setFieldErrors((prev) => ({ ...prev, customer_phone: FAILURE_MESSAGES.phone }));
  }

  function validate(phone: string = customerPhone): Record<string, string> {
    const errors: Record<string, string> = {};
    if (customerName.trim().length < 2) {
      errors.customer_name = 'Please enter the full name for delivery.';
    }
    if (!isValidNepaliPhone(phone)) {
      errors.customer_phone = FAILURE_MESSAGES.phone;
    }
    if (deliveryAddress.trim().length < 5) {
      errors.delivery_address = 'Please enter the full delivery address (ward, street, landmark).';
    }
    if (!deliveryCity) {
      errors.delivery_city = 'Choose your delivery area.';
    }
    if (customerEmail.trim() && !EMAIL_PATTERN.test(customerEmail.trim())) {
      errors.customer_email = 'Enter a valid email address, or leave it blank.';
    }
    return errors;
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) {
      setCoupon(null);
      setCouponError('Enter a coupon code, or leave the box empty.');
      return;
    }

    setCheckingCoupon(true);
    setCouponError(null);

    try {
      const preview = await validateCoupon(code, totals.subtotal);
      if (!preview.valid) {
        setCoupon(null);
        setCouponError(preview.reason || 'That code cannot be used on this order.');
        return;
      }
      setCoupon(preview);
      setCouponInput(preview.code ?? code.toUpperCase());
    } catch {
      setCoupon(null);
      setCouponError('We could not check that code. Please try again.');
    } finally {
      setCheckingCoupon(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponError(null);
    setCouponInput('');
  }

  /**
   * Places the order. Called by the form's submit event and by the banner's "Try again" button,
   * so a retry re-sends exactly what the customer already typed — nothing is ever cleared on
   * failure, including the uploaded screenshot and the coupon.
   */
  async function submitOrder() {
    setFormError(null);
    setConflict(null);
    setFieldErrors({});
    setRetryable(false);

    // Normalise once more on submit so a pasted +977 / 0-prefixed number is never rejected.
    const phone = normalizePhone(customerPhone) || customerPhone.trim();
    if (phone !== customerPhone) setCustomerPhone(phone);

    const errors = validate(phone);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      focusFirstServerError(errors);
      return;
    }

    if (lines.length === 0) {
      setFormError('Your cart is empty. Add a product before checking out.');
      return;
    }

    if (proofUploading) {
      setFormError('Your payment screenshot is still uploading — please wait a moment.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: phone,
          customer_email: customerEmail.trim(),
          delivery_address: deliveryAddress.trim(),
          delivery_city: deliveryCity,
          delivery_landmark: deliveryLandmark.trim(),
          notes: notes.trim(),
          payment_method: paymentMethod,
          items: toOrderItems(lines),
          customer_id: customer?.id ?? null,
          // Only sent when a code was actually validated; the server re-checks it either way.
          coupon_code: appliedCode ?? undefined,
          // The referral captured from `?ref=CODE` earlier in the visit, if any.
          affiliate_code: getStoredReferralCode() ?? undefined,
          // Payment proof travels only for digital payments; COD has nothing to prove yet.
          // `payment_proof_url` is the object KEY inside the private payment-proofs bucket.
          payment_reference: isDigitalPayment ? paymentReference.trim() || undefined : undefined,
          payment_proof_url: isDigitalPayment ? proofKey ?? undefined : undefined,
        }),
      });

      // Read the body once so the raw status + payload can be logged for support.
      const rawBody = await response.text();
      let data: OrderResult | null = null;
      if (rawBody) {
        try {
          data = JSON.parse(rawBody) as OrderResult;
        } catch {
          data = null;
        }
      }

      if (response.status === 201 && data?.reference) {
        // Prefer the server's figures — it re-priced every line and the coupon authoritatively.
        const serverDiscount = data.discount_npr ?? discountNpr;

        const snapshot = {
          reference: data.reference,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          customer_name: customerName.trim(),
          delivery_city: deliveryCity,
          payment_method: paymentMethod,
          // Echoed by the API; the local values are the fallback if it ever omits them.
          payment_reference:
            data.payment_reference ?? (isDigitalPayment ? paymentReference.trim() || null : null),
          payment_proof_url: data.payment_proof_url ?? (isDigitalPayment ? proofKey ?? null : null),
          subtotal_npr: data.subtotal_npr ?? totals.subtotal,
          discount_npr: serverDiscount,
          coupon_code: data.coupon_code ?? appliedCode,
          shipping_npr: data.shipping_npr ?? totals.shipping,
          total_npr: data.total_npr ?? Math.max(0, totals.total - serverDiscount),
          whatsapp_url: data.whatsapp_url ?? null,
          // `product_id` lets the confirmation screen pair each line with its thumbnail.
          items: lines.map((line) => ({
            name: line.name,
            variant: line.variant,
            quantity: line.quantity,
            line_total_npr: line.unit_price_npr * line.quantity,
            product_id: line.product_id,
          })),
        };

        try {
          window.sessionStorage.setItem('abh_last_order', JSON.stringify(snapshot));
        } catch {
          // A private-mode browser may refuse sessionStorage; the confirmation page can still
          // fall back to a reference + phone lookup.
        }

        clear();
        router.push(`/order/${data.reference}`);
        return;
      }

      // Every non-201 path is a failure: log the truth, then explain it specifically.
      console.error('[checkout] order placement failed', {
        status: response.status,
        body: rawBody,
      });

      if (response.status === 201) {
        // 201 without a reference — the order exists but we cannot route to it.
        setFormError(
          'Your order was received but we could not read its reference. Please send it on WhatsApp so we can confirm it.'
        );
        return;
      }

      if (response.status === 422) {
        const fields = data?.fields ?? {};
        setFieldErrors(fields);
        const unmapped = UNMAPPED_FIELD_KEYS.map((key) => fields[key]).filter(
          (message): message is string => Boolean(message)
        );
        const base = data?.error ?? 'Please check the highlighted fields.';
        setFormError(unmapped.length > 0 ? `${base} ${unmapped.join(' ')}` : base);
        focusFirstServerError(fields);
        return;
      }

      if (response.status === 409) {
        // Stock ran out / coupon no longer valid — show the server's own wording verbatim.
        setConflict(data?.error ?? 'One of your items is no longer available.');
        return;
      }

      if (response.status === 429) {
        setFormError(FAILURE_MESSAGES.rateLimit);
        return;
      }

      if (response.status === 503) {
        // Ordering is genuinely switched off — a real dead end, so point to WhatsApp.
        setFormError(
          data?.error ??
            'Online ordering is not available right now. Please send your order on WhatsApp.'
        );
        return;
      }

      if (response.status >= 500) {
        setFormError(FAILURE_MESSAGES.server);
        setRetryable(true);
        return;
      }

      // Any other 4xx: the server's own message is the most accurate thing we can show.
      setFormError(data?.error ?? 'We could not place your order. Please try again in a moment.');
    } catch (error) {
      console.error('[checkout] order request threw', error);
      setFormError(FAILURE_MESSAGES.server);
      setRetryable(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitOrder();
  }

  if (!hydrated) {
    return (
      <div className="panel p-10 text-center text-charcoal-soft">Loading your cart…</div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="panel mx-auto max-w-md p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
          <ShoppingBag className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-lg text-charcoal">Your cart is empty</p>
        <p className="mt-1 text-sm text-charcoal-soft">
          Browse our skincare, makeup and hair care range — then come back here to check out.
        </p>
        <Link href="/shop" className={buttonVariants({ className: 'mt-5' })}>
          Browse the shop
        </Link>
      </div>
    );
  }

  const showInstructions = paymentMethod !== 'cod' && settings.payment_instructions.trim() !== '';

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-8">
        {customer ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-gold/20 bg-blush-50 px-4 py-3 text-sm text-charcoal">
            <span className="min-w-0 break-all">
              Ordering as <span className="font-medium">{customer.email}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              className="font-medium text-rose-gold hover:underline"
            >
              Sign out
            </button>
          </div>
        ) : (
          <p className="text-sm text-charcoal-soft">
            <Link
              href="/account/login?next=/checkout"
              className="font-medium text-rose-gold hover:underline"
            >
              Sign in
            </Link>{' '}
            for faster checkout, or continue as a guest — no account needed.
          </p>
        )}

        {(formError || conflict) && (
          <div
            role="alert"
            aria-live="assertive"
            className="space-y-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <p className="font-medium">{conflict ?? formError}</p>

                {conflict && (
                  <Link href="/cart" className="inline-block underline underline-offset-4">
                    Review your cart
                  </Link>
                )}

                {retryable && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void submitOrder()}
                      loading={submitting}
                      className="min-h-11 dark:bg-white/10"
                    >
                      {submitting ? (
                        'Trying again…'
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          Try again
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* A failed checkout should still become a real order for a Nepali shop. */}
                <a
                  href={whatsappFallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 font-medium text-charcoal underline underline-offset-4 hover:text-rose-gold"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Send this order on WhatsApp instead
                </a>
              </div>
            </div>
          </div>
        )}

        <section className="panel space-y-5 p-5 sm:p-6">
          <h2 className="font-display text-xl text-charcoal">Delivery details</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="checkout-name" error={fieldErrors.customer_name}>
              <Input
                id="checkout-name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                autoComplete="name"
                placeholder="e.g. Sita Joshi"
                aria-invalid={Boolean(fieldErrors.customer_name)}
                required
              />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="checkout-phone"
              hint="10-digit Nepali mobile, e.g. 9800000000"
              error={fieldErrors.customer_phone}
            >
              <Input
                id="checkout-phone"
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                onBlur={handlePhoneBlur}
                autoComplete="tel"
                placeholder="98XXXXXXXX"
                aria-invalid={Boolean(fieldErrors.customer_phone)}
                required
              />
            </Field>
          </div>

          <Field
            label="Email (optional)"
            htmlFor="checkout-email"
            error={fieldErrors.customer_email}
          >
            <Input
              id="checkout-email"
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={Boolean(fieldErrors.customer_email)}
            />
          </Field>

          <Field
            label="Delivery address"
            htmlFor="checkout-address"
            error={fieldErrors.delivery_address}
          >
            <Textarea
              id="checkout-address"
              value={deliveryAddress}
              onChange={(event) => setDeliveryAddress(event.target.value)}
              autoComplete="street-address"
              placeholder="Ward, street or tole, house colour…"
              aria-invalid={Boolean(fieldErrors.delivery_address)}
              required
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Delivery area" htmlFor="checkout-city" error={fieldErrors.delivery_city}>
              <Select
                id="checkout-city"
                value={deliveryCity}
                onChange={(event) => setDeliveryCity(event.target.value)}
                required
              >
                {DELIVERY_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Landmark (optional)" htmlFor="checkout-landmark">
              <Input
                id="checkout-landmark"
                value={deliveryLandmark}
                onChange={(event) => setDeliveryLandmark(event.target.value)}
                placeholder="e.g. near Attariya Chowk"
              />
            </Field>
          </div>

          <Field label="Order notes (optional)" htmlFor="checkout-notes">
            <Textarea
              id="checkout-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Delivery instructions, preferred time…"
            />
          </Field>
        </section>

        <section className="panel space-y-4 p-5 sm:p-6">
          <h2 className="font-display text-xl text-charcoal">Payment method</h2>

          <fieldset className="space-y-3">
            <legend className="sr-only">Choose a payment method</legend>
            {paymentOptions.map((method) => (
              <label
                key={method}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-charcoal/15 bg-white p-4 text-sm transition-colors has-[:checked]:border-rose-gold has-[:checked]:bg-blush-50"
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                  className="h-4 w-4 accent-rose-gold"
                />
                <span className="font-medium text-charcoal">{PAYMENT_METHOD_LABELS[method]}</span>
              </label>
            ))}
          </fieldset>

          {isDigitalPayment && (
            <div className="space-y-4 rounded-2xl border border-rose-gold/20 bg-cream-100/60 p-4 sm:p-5">
              {/* The QR is generated/rendered in the browser and never overflows a 360px screen. */}
              <PaymentQR
                enabled={settings.payment_qr_enabled}
                content={settings.payment_qr_content}
                imageUrl={settings.payment_qr_image_url}
                note={settings.payment_note}
                /* Live total, so the QR re-draws whenever quantities, coupon or delivery change. */
                amount={payableTotal}
                currencyLabel="रू"
                className="max-w-full"
              />

              {showInstructions && (
                <div className="flex items-start gap-3 rounded-xl bg-blush-50 p-4 text-sm text-charcoal-soft">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
                  <p className="min-w-0 whitespace-pre-line break-words">
                    {settings.payment_instructions}
                  </p>
                </div>
              )}

              <Field
                label="Transaction ID / reference (optional)"
                htmlFor="checkout-payment-reference"
                hint="The reference from your eSewa, Khalti or bank receipt. You can add it later too."
              >
                <Input
                  id="checkout-payment-reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="e.g. 0AB12345XY"
                />
              </Field>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-charcoal">
                  Upload your payment screenshot
                </span>

                <input
                  ref={proofInputRef}
                  id="checkout-payment-proof"
                  type="file"
                  accept={PROOF_ACCEPT}
                  className="sr-only"
                  onChange={handleProofSelect}
                />

                {!proofFile ? (
                  <label
                    htmlFor="checkout-payment-proof"
                    className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rose-gold/40 bg-white px-4 py-3 text-sm font-medium text-rose-gold transition-colors hover:border-rose-gold hover:bg-blush-50 focus-within:ring-2 focus-within:ring-rose-gold/25"
                  >
                    <UploadCloud className="h-5 w-5" aria-hidden="true" />
                    Choose image or PDF
                  </label>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-charcoal/10 bg-white p-3">
                    {proofPreview ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset. */
                      <img
                        src={proofPreview}
                        alt="Your payment screenshot preview"
                        className="h-16 w-16 shrink-0 rounded-lg border border-charcoal/10 object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-blush-50 text-rose-gold">
                        <FileText className="h-6 w-6" aria-hidden="true" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-medium text-charcoal">{proofFile.name}</p>

                      {proofUploading ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-charcoal-soft">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Uploading…
                        </p>
                      ) : proofKey ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Uploaded — we will check it with your order.
                        </p>
                      ) : proofError ? (
                        <p className="mt-1 text-xs font-medium text-danger" role="alert">
                          {proofError}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label
                          htmlFor="checkout-payment-proof"
                          className="cursor-pointer text-xs font-medium text-rose-gold hover:underline"
                        >
                          Change
                        </label>
                        <button
                          type="button"
                          onClick={clearProof}
                          className="inline-flex items-center gap-1 text-xs font-medium text-charcoal-soft hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-charcoal-soft">
                  Optional. If the upload fails, don&apos;t worry — place the order and send the
                  screenshot to us on WhatsApp instead.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* `pb-24` keeps the summary clear of the fixed WhatsApp button on small screens. */}
      <aside className="space-y-4 pb-24 lg:sticky lg:top-24 lg:pb-0">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-display text-xl text-charcoal">Order summary</h2>

          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={`${line.product_id}::${line.variant ?? ''}`} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-charcoal">
                  {line.name}
                  {line.variant ? <span className="text-charcoal-soft"> · {line.variant}</span> : null}
                  <span className="block text-xs text-charcoal-soft">
                    {line.quantity} × {formatNPR(line.unit_price_npr)}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-medium text-price">
                  {formatNPR(line.unit_price_npr * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-charcoal/10 pt-4">
            <Field
              label="Coupon code (optional)"
              htmlFor="checkout-coupon"
              hint="Optional — leave this blank if you do not have a code."
              error={couponError}
            >
              <div className="flex gap-2">
                <Input
                  id="checkout-coupon"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value)}
                  placeholder="e.g. DASHAIN10"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 uppercase"
                  aria-invalid={Boolean(couponError)}
                />
                {coupon?.valid ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeCoupon}
                    className="min-h-11 shrink-0 dark:bg-white/10"
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={applyCoupon}
                    loading={checkingCoupon}
                    className="min-h-11 shrink-0"
                  >
                    Apply
                  </Button>
                )}
              </div>
            </Field>

            {coupon && coupon.valid ? (
              <p
                role="status"
                aria-live="polite"
                className="mt-2 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs font-medium text-success"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {appliedCode} applied — you save {formatNPR(discountNpr)}
                </span>
              </p>
            ) : null}
          </div>

          <dl className="space-y-2 border-t border-charcoal/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-charcoal-soft">Subtotal</dt>
              <dd className="font-medium text-price">{formatNPR(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-charcoal-soft">Delivery</dt>
              <dd className="font-medium text-price">
                {totals.shipping === 0 ? 'Free' : formatNPR(totals.shipping)}
              </dd>
            </div>
            {discountNpr > 0 ? (
              <div className="flex justify-between">
                <dt className="min-w-0 break-words text-charcoal-soft">
                  Discount{appliedCode ? ` (${appliedCode})` : ''}
                </dt>
                <dd className="shrink-0 whitespace-nowrap font-medium text-success">
                  −{formatNPR(discountNpr)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-charcoal/10 pt-2 text-base">
              <dt className="font-medium text-charcoal">Total</dt>
              <dd className="font-display text-xl text-price">{formatNPR(payableTotal)}</dd>
            </div>
          </dl>

          {totals.freeShippingRemaining > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-blush-100 p-3 text-xs text-charcoal-soft">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Add {formatNPR(totals.freeShippingRemaining)} more for free delivery.
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={submitting || proofUploading}
            className="w-full"
          >
            {submitting ? 'Placing order…' : proofUploading ? 'Uploading screenshot…' : 'Place order'}
          </Button>

          <p className="text-xs text-charcoal-soft">
            Your final amount — including any coupon discount — is confirmed by the shop when your
            order is accepted.
          </p>

          <Link
            href="/cart"
            className="block text-center text-sm text-charcoal-soft underline underline-offset-4 hover:text-charcoal"
          >
            Back to cart
          </Link>
        </Card>
      </aside>
    </form>
  );
}
