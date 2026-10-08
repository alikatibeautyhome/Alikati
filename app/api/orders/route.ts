import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import { demoDb } from '@/lib/demo-data';
import { lookupOrder } from '@/lib/shop-api';
import { createOrderNotificationLink } from '@/lib/whatsapp';
import { isValidNepaliPhone } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS, SELECTABLE_PAYMENT_METHODS } from '@/lib/commerce';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';
import type { OrderResult, PaymentMethod, SelectablePaymentMethod } from '@/types/commerce.types';

export const dynamic = 'force-dynamic';

/**
 * Accepts only an object key inside the private `payment-proofs` bucket, e.g.
 * `2026-09/9f3c1a.jpg`. A full URL is rejected on purpose: otherwise a client could make the
 * admin console render third-party content, and the bucket is private so a public URL would
 * not resolve anyway.
 */
function sanitizeProofKey(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 200) return null;
  if (raw.includes('..') || raw.startsWith('/')) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(raw)) return null;
  return raw;
}

const MAX_LINES = 25;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ordering is the most valuable thing to a script and the least forgivable to lose, so it is the
 *  tightest limit — a genuine customer places one order, not eight. */
const rateLimited = createRateLimiter({
  bucket: 'orders',
  limit: Number(process.env.ORDER_RATE_LIMIT_PER_MIN ?? 8),
});

/** Turns the SQL `place_order()` exceptions into messages a customer can act on. */
function mapPlacementError(raw: string): { status: number; message: string } {
  if (raw.includes('EMPTY_CART')) {
    return { status: 400, message: 'Your cart is empty.' };
  }
  if (raw.includes('TOO_MANY_LINES')) {
    return { status: 400, message: 'That is too many different items in one order. Please split it into two.' };
  }
  if (raw.includes('PRODUCT_NOT_FOUND')) {
    return { status: 409, message: 'One of the items is no longer available. Please refresh your cart.' };
  }
  if (raw.includes('PRODUCT_INACTIVE')) {
    const name = raw.split('PRODUCT_INACTIVE:')[1]?.trim();
    return { status: 409, message: `${name ?? 'An item'} is no longer for sale. Please remove it from your cart.` };
  }
  if (raw.includes('COUPON_MIN_ORDER')) {
    const amount = Number(raw.split('COUPON_MIN_ORDER:')[1] ?? 0);
    return {
      status: 409,
      message: `This code needs a minimum spend of रू ${amount.toLocaleString('en-IN')}. Remove the code or add more items.`,
    };
  }
  if (raw.includes('COUPON_INACTIVE') || raw.includes('COUPON_EXPIRED')) {
    return { status: 409, message: 'That coupon code has ended. Please remove it and try again.' };
  }
  if (raw.includes('COUPON_NOT_STARTED')) {
    return { status: 409, message: 'That coupon is not active yet. Please remove it and try again.' };
  }
  if (raw.includes('COUPON_EXHAUSTED')) {
    return { status: 409, message: 'That coupon has been fully claimed. Please remove it and try again.' };
  }
  if (raw.includes('COUPON_ALREADY_USED')) {
    return { status: 409, message: 'This coupon has already been used on a previous order.' };
  }
  if (raw.includes('INSUFFICIENT_STOCK')) {
    const name = raw.split('INSUFFICIENT_STOCK:')[1]?.trim();
    return {
      status: 409,
      message: `We do not have enough stock of ${name ?? 'one item'}. Please reduce the quantity or remove it.`,
    };
  }
  return { status: 500, message: 'We could not place your order. Please call us on WhatsApp.' };
}

/* ────────────────────────────────────────────────────────────────── POST ── */

export async function POST(request: NextRequest) {
  if (await rateLimited(clientIp(request))) {
    return NextResponse.json<OrderResult>(
      { ok: false, error: 'Too many attempts. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json<OrderResult>({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const customer_name = String(body.customer_name ?? '').trim();
  const customer_phone = String(body.customer_phone ?? '').trim();
  const customer_email = String(body.customer_email ?? '').trim();
  const delivery_address = String(body.delivery_address ?? '').trim();
  const delivery_city = String(body.delivery_city ?? '').trim();
  const delivery_landmark = String(body.delivery_landmark ?? '').trim();
  // The three parts a Nepali address is composed of. `delivery_district` also decides the courier
  // fee, which `place_order()` computes — see migration 0024.
  const delivery_district = String(body.delivery_district ?? '').trim().slice(0, 60);
  const delivery_municipality = String(body.delivery_municipality ?? '').trim().slice(0, 80);
  const delivery_ward = String(body.delivery_ward ?? '').trim().slice(0, 20);
  const notes = String(body.notes ?? '').trim();
  const payment_method = String(body.payment_method ?? 'cod') as PaymentMethod;
  // Optional account link. Guests simply omit it; it is validated below and re-checked in live mode.
  const rawCustomerId = String(body.customer_id ?? '').trim();
  // Optional marketing codes. Only their shape is checked here — `place_order()` re-reads the
  // coupon and recomputes the discount, so a forged code cannot buy anything.
  const coupon_code = String(body.coupon_code ?? '').trim().toUpperCase().slice(0, 32);
  const affiliate_code = String(body.affiliate_code ?? '').trim().toUpperCase().slice(0, 32);
  const payment_reference = String(body.payment_reference ?? '').trim().slice(0, 80);
  const payment_proof_url = sanitizeProofKey(body.payment_proof_url);

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        product_id: String(row.product_id ?? '').trim(),
        quantity: Math.max(1, Math.min(20, Number(row.quantity ?? 1))),
        variant: row.variant ? String(row.variant).slice(0, 120) : null,
      };
    })
    .filter((line) => line.product_id.length > 0);

  /* --------------------------------------------------------- validation */
  const fields: Record<string, string> = {};

  if (customer_name.length < 2 || customer_name.length > 120) {
    fields.customer_name = 'Please enter the full name for delivery.';
  }
  if (!isValidNepaliPhone(customer_phone)) {
    fields.customer_phone = 'Enter a valid 10-digit Nepali mobile number.';
  }
  if (delivery_address.length < 5 || delivery_address.length > 400) {
    fields.delivery_address = 'Please enter the full delivery address (ward, street, landmark).';
  }
  if (delivery_city.length < 2 || delivery_city.length > 80) {
    fields.delivery_city = 'Choose or enter your delivery area.';
  }
  if (delivery_district.length < 2) {
    fields.delivery_district = 'Choose your district.';
  }
  if (delivery_municipality.length < 2 || delivery_municipality.length > 80) {
    fields.delivery_municipality = 'Enter your municipality or rural municipality.';
  }
  // Wards run 1–32 in Nepal; anything outside that is a typo rather than a place.
  if (!/^\d{1,2}$/.test(delivery_ward) || Number(delivery_ward) < 1 || Number(delivery_ward) > 32) {
    fields.delivery_ward = 'Enter the ward number (1–32).';
  }
  // Validated against the same list checkout renders from, so the two cannot drift. Legacy orders
  // may still carry esewa or khalti: those stay readable, but cannot be chosen for a new order.
  if (!SELECTABLE_PAYMENT_METHODS.includes(payment_method as SelectablePaymentMethod)) {
    fields.payment_method = 'Choose a payment method.';
  }
  if (items.length === 0) {
    fields.items = 'Your cart is empty.';
  }
  if (items.length > MAX_LINES) {
    fields.items = 'Too many different items in one order.';
  }
  if (customer_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer_email)) {
    fields.customer_email = 'Enter a valid email address, or leave it blank.';
  }

  let customer_id: string | null = null;
  if (rawCustomerId) {
    if (UUID_PATTERN.test(rawCustomerId)) {
      customer_id = rawCustomerId;
    } else {
      fields.customer_id = 'Your account reference was not valid. Please refresh and try again.';
    }
  }

  if (Object.keys(fields).length > 0) {
    return NextResponse.json<OrderResult>(
      { ok: false, error: 'Please check the highlighted fields.', fields },
      { status: 422 }
    );
  }

  const payload = {
    customer_name,
    customer_phone,
    customer_email: customer_email || null,
    delivery_address,
    delivery_city,
    delivery_district,
    delivery_municipality,
    delivery_ward,
    delivery_landmark: delivery_landmark || null,
    notes: notes || null,
    payment_method,
    items,
    customer_id,
    coupon_code,
    affiliate_code,
    payment_reference: payment_reference || null,
    payment_proof_url,
  };

  /* ----------------------------------------------------- place the order */
  let orderId: string;
  let reference: string;
  let subtotal: number;
  let discount = 0;
  let shipping: number;
  let total: number;
  let appliedCoupon: string | null = null;
  let appliedAffiliate: string | null = null;
  let businessWhatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '9779800000000';
  let resolvedNames = new Map<string, string>();

  if (isDemoMode()) {
    try {
      const order = demoCommerceDb.createOrder(payload);
      // The demo order book has no customer_id column; attach it after creation instead.
      if (customer_id) demoCommerceDb.updateOrder(order.id, { customer_id });
      orderId = order.id;
      reference = order.reference;
      subtotal = order.subtotal_npr;
      discount = Number(order.discount_npr ?? 0);
      shipping = order.shipping_npr;
      total = order.total_npr;
      appliedCoupon = order.coupon_code ?? null;
      appliedAffiliate = order.affiliate_code ?? null;
      resolvedNames = new Map((order.items ?? []).map((item) => [item.product_id ?? '', item.product_name]));
      businessWhatsapp = demoDb.getSettings().whatsapp_number;
    } catch (error) {
      const mapped = mapPlacementError(error instanceof Error ? error.message : '');
      return NextResponse.json<OrderResult>({ ok: false, error: mapped.message }, { status: mapped.status });
    }
  } else {
    const supabase = await createClient();

    // Never trust the client-supplied id: keep it only when it matches the signed-in user.
    if (payload.customer_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || user.id !== payload.customer_id) {
        payload.customer_id = null;
      } else {
        // The id must also exist in `customers`, or `orders.customer_id` fails its foreign key
        // and the entire checkout errors out — which is exactly what happened to a signed-in
        // staff account (staff never get a customer row: migration 0010 only creates one for
        // non-staff signups). Any account can order, so make sure the row exists.
        const admin = createAdminClient();
        if (admin) {
          const { data: existing } = await admin
            .from('customers')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

          if (!existing) {
            const { error: linkError } = await admin.from('customers').insert({
              id: user.id,
              email: (user.email ?? customer_email) || null,
              full_name: user.user_metadata?.full_name ?? customer_name,
              phone: customer_phone,
            });
            // A failure here is not fatal: the SQL function degrades an unknown id to a guest
            // order rather than rejecting the sale (migration 0012).
            if (linkError) {
              console.error('[api/orders] could not create the customer row:', linkError.message);
            }
          }
        }
      }
    }

    const { data: settings } = await supabase
      .from('salon_settings')
      .select('whatsapp_number')
      .eq('id', 1)
      .single();
    businessWhatsapp = settings?.whatsapp_number ?? businessWhatsapp;

    // Product names are public data; fetch them for the WhatsApp summary.
    const { data: named } = await supabase
      .from('products')
      .select('id, name')
      .in('id', items.map((line) => line.product_id));
    resolvedNames = new Map((named ?? []).map((row) => [row.id as string, row.name as string]));

    const writer = createAdminClient();
    if (!writer) {
      console.error('[api/orders] SUPABASE_SERVICE_ROLE_KEY is missing — orders cannot be placed.');
      return NextResponse.json<OrderResult>(
        { ok: false, error: 'Online ordering is not configured yet. Please order on WhatsApp.' },
        { status: 503 }
      );
    }

    const { data, error } = await writer.rpc('place_order', { payload });

    if (error) {
      console.error('[api/orders] place_order failed:', error.message);
      const mapped = mapPlacementError(error.message);
      return NextResponse.json<OrderResult>({ ok: false, error: mapped.message }, { status: mapped.status });
    }

    // Column names MUST match `RETURNS TABLE(...)` in migration 0008:
    // order_id, order_reference, subtotal, discount, shipping, total, coupon_applied,
    // affiliate_applied. They deliberately differ from the `orders` table's *_npr columns.
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          order_id: string;
          order_reference: string;
          subtotal: number | string;
          discount: number | string | null;
          shipping: number | string;
          total: number | string;
          coupon_applied: string | null;
          affiliate_applied: string | null;
        }
      | undefined;

    if (!row) {
      return NextResponse.json<OrderResult>(
        { ok: false, error: 'We could not place your order. Please try again.' },
        { status: 500 }
      );
    }

    orderId = row.order_id;
    reference = row.order_reference;
    subtotal = Number(row.subtotal);
    discount = Number(row.discount ?? 0);
    shipping = Number(row.shipping);
    total = Number(row.total);

    // Guard: a renamed/added OUT column would otherwise reach customers as "रू NaN" instead of
    // failing loudly. The order itself is already committed, so log hard and carry on.
    if (![subtotal, discount, shipping, total].every((value) => Number.isFinite(value))) {
      console.error(
        '[api/orders] place_order returned non-numeric totals — check the RPC column names.',
        { subtotal, discount, shipping, total, reference }
      );
    }
    appliedCoupon = row.coupon_applied ?? null;
    appliedAffiliate = row.affiliate_applied ?? null;

    // Payment details are attached AFTER placement so the pricing-critical place_order()
    // signature stays untouched. A failure here must never fail the checkout: the order is
    // already placed and priced correctly, so it is logged and the customer is told to send
    // the screenshot on WhatsApp instead.
    if (payment_reference || payment_proof_url) {
      const { error: attachError } = await writer
        .from('orders')
        .update({ payment_reference: payment_reference || null, payment_proof_url })
        .eq('id', orderId);

      if (attachError) {
        console.error('[api/orders] could not attach payment details:', attachError.message);
      }
    }
  }

  const whatsapp_url = createOrderNotificationLink({
    reference,
    customer_name,
    customer_phone,
    delivery_city,
    payment_method_label: PAYMENT_METHOD_LABELS[payment_method],
    total_npr: total,
    items: items.map((line) => ({
      name: resolvedNames.get(line.product_id) ?? 'Item',
      quantity: line.quantity,
      variant: line.variant,
    })),
    business_whatsapp: businessWhatsapp,
    subtotal_npr: subtotal,
    discount_npr: discount,
    shipping_npr: shipping,
    coupon_code: appliedCoupon,
    payment_reference: payment_reference || null,
    payment_proof_url,
    delivery_address,
  });

  return NextResponse.json<OrderResult>(
    {
      ok: true,
      order_id: orderId,
      reference,
      subtotal_npr: subtotal,
      discount_npr: discount,
      shipping_npr: shipping,
      total_npr: total,
      coupon_code: appliedCoupon,
      affiliate_code: appliedAffiliate,
      payment_reference: payment_reference || null,
      payment_proof_url,
      whatsapp_url,
    },
    { status: 201 }
  );
}

/* ─────────────────────────────────────────────────────────────────── GET ── */

/**
 * GET /api/orders?reference=ABH-ORD-XXXXXX&phone=98XXXXXXXX
 *
 * Customer-side status lookup. The phone number acts as the shared secret, so a reference
 * alone cannot reveal another customer's order.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = (searchParams.get('reference') ?? '').trim().toUpperCase();
  const phone = (searchParams.get('phone') ?? '').trim();

  if (!/^ABH-ORD-[A-Z0-9]{4,8}$/.test(reference) && !/^ABH-[A-Z0-9]{6}$/.test(reference)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid order reference.' }, { status: 400 });
  }
  if (!isValidNepaliPhone(phone)) {
    return NextResponse.json({ ok: false, error: 'Enter the mobile number used for the order.' }, { status: 400 });
  }

  const found = await lookupOrder(reference, phone);

  if (!found) {
    return NextResponse.json(
      { ok: false, error: 'No order matches that reference and phone number.' },
      { status: 404 }
    );
  }

  const { order, items } = found;

  return NextResponse.json(
    {
      ok: true,
      order: {
        reference: order.reference,
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        delivery_city: order.delivery_city,
        subtotal_npr: Number(order.subtotal_npr),
        discount_npr: Number(order.discount_npr ?? 0),
        shipping_npr: Number(order.shipping_npr),
        total_npr: Number(order.total_npr),
        created_at: order.created_at,
        items: items.map((item) => ({
          name: item.product_name,
          variant: item.variant,
          quantity: item.quantity,
          line_total_npr: Number(item.line_total_npr),
        })),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
