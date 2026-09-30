/**
 * WhatsApp deep-link builders.
 *
 * Every message the platform sends through WhatsApp is assembled here so formatting stays
 * consistent between the public booking flow and the staff-side admin console.
 */
import { formatDateLong, formatNPR, normalizeWhatsAppNumber, to12Hour } from '@/lib/utils';

/** `*bold*` is WhatsApp's mark-up; `\n` must survive `encodeURIComponent`. */
export function createWhatsAppBookingLink(appointment: {
  client_name: string;
  client_phone: string;
  service_title: string;
  booking_date: string;
  booking_time: string;
  total_amount_npr: number;
  business_whatsapp: string;
  reference_code?: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(appointment.business_whatsapp);

  const text =
    `*✨ New Appointment Booking - Alikati Beauty Home*\n` +
    `--------------------------------------\n` +
    (appointment.reference_code ? `• *Reference:* ${appointment.reference_code}\n` : '') +
    `• *Client Name:* ${appointment.client_name}\n` +
    `• *Phone Number:* ${appointment.client_phone}\n` +
    `• *Service:* ${appointment.service_title}\n` +
    `• *Date:* ${appointment.booking_date}\n` +
    `• *Time Slot:* ${appointment.booking_time}\n` +
    `• *Price:* NPR रू ${appointment.total_amount_npr.toLocaleString('en-IN')}\n` +
    `--------------------------------------\n` +
    `Please confirm if this slot is available. Thank you!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/** Status pings sent BY staff TO clients from the admin dispatch table. */
export function createStatusNotificationLink(opts: {
  client_phone: string;
  client_name: string;
  service_title: string;
  booking_date: string;
  booking_time: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  business_whatsapp: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.client_phone);
  const greeting = `नमस्ते ${opts.client_name} जी 🙏`;

  const templates: Record<typeof opts.status, string> = {
    confirmed:
      `Your appointment at *Alikati Beauty Home* is *CONFIRMED* ✅\n` +
      `• Service: ${opts.service_title}\n` +
      `• Date: ${formatDateLong(opts.booking_date)}\n` +
      `• Time: ${to12Hour(opts.booking_time)}\n` +
      `Please arrive 5 minutes early. Thank you!`,
    cancelled:
      `We are sorry, but your appointment could not be accommodated ❌\n` +
      `• Service: ${opts.service_title}\n` +
      `• Date: ${formatDateLong(opts.booking_date)}\n` +
      `• Time: ${to12Hour(opts.booking_time)}\n` +
      `Please reply here and we will find you a better slot.`,
    completed:
      `Thank you for visiting *Alikati Beauty Home* 💐\n` +
      `We hope you loved your ${opts.service_title}. A short review would mean a lot to us!`,
  };

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `${greeting}\n\n${templates[opts.status]}`
  )}`;
}

/** Course inquiry hand-off from the academy lead form. */
export function createAcademyInquiryLink(opts: {
  student_name: string;
  student_phone: string;
  course_title: string;
  duration_weeks: number;
  fee_npr: number;
  business_whatsapp: string;
  notes?: string | null;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.business_whatsapp);

  const text =
    `*🎓 Academy Course Inquiry - Alikati Beauty Home*\n` +
    `--------------------------------------\n` +
    `• *Name:* ${opts.student_name}\n` +
    `• *Phone:* ${opts.student_phone}\n` +
    `• *Course:* ${opts.course_title}\n` +
    `• *Duration:* ${opts.duration_weeks} weeks\n` +
    `• *Fee:* ${formatNPR(opts.fee_npr)}\n` +
    (opts.notes ? `• *Notes:* ${opts.notes}\n` : '') +
    `--------------------------------------\n` +
    `Please share the next batch start date. Thank you!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/** Generic "chat with us" link used by the floating action button and contact page. */
export function createGeneralContactLink(opts: {
  business_whatsapp: string;
  context?: string;
  client_name?: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.business_whatsapp);
  const greeting = opts.client_name ? `नमस्ते, I am ${opts.client_name}. ` : 'नमस्ते! ';
  const text = `${greeting}${opts.context ?? 'I would like to know more about your services at Alikati Beauty Home.'}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/* ─────────────────────────────────────────────────────────────── shop orders */

/** Order notification sent BY the customer TO the salon after checkout. */
export function createOrderNotificationLink(opts: {
  reference: string;
  customer_name: string;
  customer_phone: string;
  delivery_city: string;
  payment_method_label: string;
  total_npr: number;
  items: Array<{ name: string; quantity: number; variant?: string | null }>;
  business_whatsapp: string;
  /** Optional so existing callers keep working; shown when supplied. */
  subtotal_npr?: number;
  discount_npr?: number;
  shipping_npr?: number;
  coupon_code?: string | null;
  payment_reference?: string | null;
  payment_proof_url?: string | null;
  delivery_address?: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.business_whatsapp);

  const lines = opts.items
    .map((item) => `   – ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}`)
    .join('\n');

  const text =
    `*🛍️ New Order - Alikati Beauty Home*\n` +
    `--------------------------------------\n` +
    `• *Reference:* ${opts.reference}\n` +
    `• *Name:* ${opts.customer_name}\n` +
    `• *Phone:* ${opts.customer_phone}\n` +
    `• *Deliver to:* ${opts.delivery_city}\n` +
    `• *Payment:* ${opts.payment_method_label}\n` +
    (opts.payment_reference ? `• *Transaction ID:* ${opts.payment_reference}\n` : '') +
    (opts.delivery_address ? `• *Address:* ${opts.delivery_address}\n` : '') +
    `--------------------------------------\n` +
    `*Items:*\n${lines}\n` +
    `--------------------------------------\n` +
    (opts.subtotal_npr !== undefined ? `• *Subtotal:* NPR रू ${opts.subtotal_npr.toLocaleString('en-IN')}\n` : '') +
    (opts.discount_npr ? `• *Discount* (${opts.coupon_code ?? 'coupon'}): − NPR रू ${opts.discount_npr.toLocaleString('en-IN')}\n` : '') +
    (opts.shipping_npr ? `• *Delivery:* NPR रू ${opts.shipping_npr.toLocaleString('en-IN')}\n` : '') +
    `• *Total:* NPR रू ${opts.total_npr.toLocaleString('en-IN')}\n` +
    (opts.payment_proof_url ? `• *Payment screenshot:* attached in the shop dashboard\n` : '') +
    `\nPlease confirm my order and delivery time. Thank you!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Checkout recovery link.
 *
 * Sent BY the customer TO the salon when `POST /api/orders` could not complete — a stock
 * conflict, a rate limit, or a 5xx. Unlike `createOrderNotificationLink` it carries a price on
 * every line, plus the address, coupon and transaction id, so the salon can turn a failed
 * checkout into a real order straight from WhatsApp without asking for anything twice.
 */
export function createCheckoutFallbackLink(opts: {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_city: string;
  business_whatsapp: string;
  items: Array<{ name: string; variant?: string | null; quantity: number; line_total_npr: number }>;
  subtotal_npr: number;
  shipping_npr: number;
  discount_npr?: number;
  coupon_code?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  total_npr: number;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.business_whatsapp);

  const lines = opts.items
    .map(
      (item) =>
        `   – ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity} = ${formatNPR(
          item.line_total_npr
        )}`
    )
    .join('\n');

  const text =
    `*🛍️ Order sent from checkout - Alikati Beauty Home*\n` +
    `--------------------------------------\n` +
    `• *Name:* ${opts.customer_name}\n` +
    `• *Phone:* ${opts.customer_phone}\n` +
    `• *Deliver to:* ${opts.delivery_city}\n` +
    `• *Address:* ${opts.delivery_address}\n` +
    (opts.notes ? `• *Notes:* ${opts.notes}\n` : '') +
    (opts.payment_reference ? `• *Transaction ID:* ${opts.payment_reference}\n` : '') +
    (opts.coupon_code ? `• *Coupon:* ${opts.coupon_code}\n` : '') +
    `--------------------------------------\n` +
    `*Items:*\n${lines || '   – (cart empty)'}\n` +
    `--------------------------------------\n` +
    `• *Subtotal:* ${formatNPR(opts.subtotal_npr)}\n` +
    (opts.discount_npr ? `• *Discount:* − ${formatNPR(opts.discount_npr)}\n` : '') +
    `• *Delivery:* ${opts.shipping_npr === 0 ? 'Free' : formatNPR(opts.shipping_npr)}\n` +
    `• *Total:* ${formatNPR(opts.total_npr)}\n` +
    `--------------------------------------\n` +
    `The website checkout did not complete, so I am sending my order here. Please confirm it. Thank you!`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Quick order link — the no-registration path.
 *
 * A shopper who would rather not create an account or fill in a checkout form taps "Order via
 * WhatsApp" and lands in a chat with the order already written out: every line with its quantity
 * and price, the total, and where to deliver.
 *
 * This is a first-class way to buy, not a recovery route, which is why the wording is a customer
 * *placing* an order. `createCheckoutFallbackLink` covers the other case — re-sending a basket by
 * hand after a checkout failed.
 *
 * `delivery_location` is optional and the line is dropped entirely when missing rather than
 * printed empty: "Delivery Location:" with nothing after it reads as a mistake in a chat.
 */
export function createCartOrderLink(opts: {
  items: Array<{
    name: string;
    /** A shade or size, appended in brackets when present. */
    variant?: string | null;
    quantity: number;
    line_total_npr: number;
  }>;
  total_npr: number;
  delivery_location?: string | null;
  business_whatsapp: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.business_whatsapp);

  const lines = opts.items
    .map(
      (item) =>
        `- ${item.name}${item.variant ? ` (${item.variant})` : ''} (Qty: ${item.quantity}) - NPR ${item.line_total_npr.toLocaleString(
          'en-IN'
        )}`
    )
    .join('\n');

  const location = opts.delivery_location?.trim();

  const text =
    `Namaste Alikati Beauty Home! I would like to place an order:\n` +
    `${lines}\n` +
    `Total Order Value: NPR ${opts.total_npr.toLocaleString('en-IN')}\n` +
    (location ? `Delivery Location: ${location}\n` : '') +
    `Please confirm stock availability and delivery.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/** Fulfilment update sent BY the salon TO the customer from the orders screen. */
export function createOrderStatusLink(opts: {
  customer_phone: string;
  customer_name: string;
  reference: string;
  status: 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
  total_npr: number;
  delivery_city?: string;
  business_whatsapp: string;
}): string {
  const cleanPhone = normalizeWhatsAppNumber(opts.customer_phone);
  const greeting = `नमस्ते ${opts.customer_name} जी 🙏`;

  const templates: Record<typeof opts.status, string> = {
    confirmed:
      `Your order *${opts.reference}* is *CONFIRMED* ✅\n` +
      `Total: NPR रू ${opts.total_npr.toLocaleString('en-IN')}\n` +
      `We will pack it and let you know when it is dispatched.`,
    packed:
      `Your order *${opts.reference}* has been *PACKED* 📦\n` +
      `We are arranging delivery${opts.delivery_city ? ` to ${opts.delivery_city}` : ''}.`,
    shipped:
      `Your order *${opts.reference}* is *ON THE WAY* 🚚\n` +
      `Please keep NPR रू ${opts.total_npr.toLocaleString('en-IN')} ready${opts.delivery_city ? ` if you chose cash on delivery` : ''}.`,
    delivered:
      `Your order *${opts.reference}* has been *DELIVERED* 💐\n` +
      `Thank you for shopping with Alikati Beauty Home. A short review would mean a lot!`,
    cancelled:
      `Your order *${opts.reference}* has been *CANCELLED*.\n` +
      `If this was not expected, please reply here and we will sort it out right away.`,
  };

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    `${greeting}\n\n${templates[opts.status]}`
  )}`;
}
