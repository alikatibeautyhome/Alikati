/**
 * Commerce helpers shared by the storefront and the admin console.
 * Pure functions and constant maps only — safe to import from server or client code.
 */
import type { CartLine, CartTotals, CustomerSummary, Order, OrderStatus, PaymentMethod, PaymentStatus, Product, ProductUseType, SelectablePaymentMethod, ShopKpis } from '@/types/commerce.types';
import type { SalonSettings } from '@/types/database.types';

/* ------------------------------------------------------------------- labels */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-warn/10 text-warn ring-warn/25',
  confirmed: 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25',
  packed: 'bg-gold-100 text-gold-700 ring-gold/30',
  shipped: 'bg-charcoal/10 text-charcoal ring-charcoal/20',
  delivered: 'bg-success/10 text-success ring-success/25',
  cancelled: 'bg-danger/10 text-danger ring-danger/25',
};

/** Fulfilment pipeline order, used for board columns and progress hints. */
export const ORDER_PIPELINE: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];

/** Allowed transitions from a given status (cancellation is handled separately). */
export const NEXT_ORDER_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Labels for every value an order can carry, including the retired ones.
 *
 * `esewa` and `khalti` are here only so past orders read correctly. They are absent from
 * SELECTABLE_PAYMENT_METHODS below, which is what checkout iterates, so they cannot be chosen.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  bank_transfer: 'Bank transfer',
  esewa: 'eSewa',
  khalti: 'Khalti',
};

/**
 * The payment methods checkout offers, in the order they should appear.
 *
 * A single source of truth: checkout renders from this list, and the order API validates against
 * it, so an option can never appear in the UI without the server accepting it (or vice versa).
 * Adding a method back — mobile wallet, card — means adding it here and to PaymentMethod.
 */
export const SELECTABLE_PAYMENT_METHODS: SelectablePaymentMethod[] = ['cod', 'bank_transfer'];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  refunded: 'Refunded',
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  unpaid: 'bg-warn/10 text-warn ring-warn/25',
  paid: 'bg-success/10 text-success ring-success/25',
  refunded: 'bg-charcoal/10 text-charcoal-soft ring-charcoal/20',
};

/** Destination cities offered at checkout (Kailali district and nearby). */
export const DELIVERY_CITIES = [
  'Attariya',
  'Mahendranagar',
  'Dhangadhi',
  'Tikapur',
  'Godawari',
  'Lamki',
  'Other (Kailali)',
  'Other (Nepal)',
] as const;

/**
 * Districts offered at checkout, Kailali first because that is the shop's own and the default.
 *
 * Far-western Nepal is the trade area, so Sudurpashchim leads; the rest of the country follows for
 * the customers who order from Kathmandu or Pokhara.
 */
export const NEPAL_DISTRICTS = [
  'Kailali',
  'Kanchanpur',
  'Doti',
  'Dadeldhura',
  'Baitadi',
  'Darchula',
  'Bajhang',
  'Bajura',
  'Achham',
  'Kathmandu',
  'Lalitpur',
  'Bhaktapur',
  'Pokhara (Kaski)',
  'Chitwan',
  'Banke',
  'Bardiya',
  'Other district',
] as const;

/** The town we deliver in ourselves, and therefore the one that costs nothing. */
export const FREE_DELIVERY_CITY = 'Attariya';

/**
 * Readable labels for the `use_type` facet, in tab order.
 *
 * A closed union — matching the CHECK constraint — so this is a label map rather than a list that
 * could drift from the catalogue. The brand and concern lists are derived from the products
 * themselves and are deliberately NOT written down here.
 */
export const PRODUCT_USE_TYPE_LABELS: Record<ProductUseType, string> = {
  retail: 'Retail Skincare & Makeup',
  professional: 'Professional Salon Supplies',
};

/**
 * Delivery fee for a destination — the client-side mirror of `public.delivery_fee_for()`.
 *
 * The SQL function is the authority: the fee an order is actually charged is computed there, by
 * `place_order()`, and this only exists so the checkout can show the customer the right number
 * before the order exists. **If the rule changes, both must change together** — they are two
 * implementations of one decision, and nothing enforces that they agree.
 *
 * Kept deliberately in step with migration 0024:
 *   Attariya                     → 0
 *   anywhere else in Kailali     → 100 flat
 *   outside Kailali              → the configured fee, waived above the free-delivery threshold
 */
export const KAILALI_FLAT_DELIVERY_NPR = 100;

export function deliveryFeeFor(opts: {
  district: string;
  city: string;
  subtotal: number;
  feeNpr: number;
  freeThresholdNpr: number;
}): number {
  if (opts.city.trim() === FREE_DELIVERY_CITY) return 0;
  if (opts.district.trim() === 'Kailali') return KAILALI_FLAT_DELIVERY_NPR;
  if (opts.freeThresholdNpr > 0 && opts.subtotal >= opts.freeThresholdNpr) return 0;
  return opts.feeNpr;
}

/* -------------------------------------------------------------- identifiers */

/** `ABH-ORD-9F3C21` — matches the reference generated by `place_order()` in SQL. */
export function formatOrderReference(id: string): string {
  return `ABH-ORD-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/* ------------------------------------------------------------------ pricing */

/** Price actually charged for a product (discount applied only when it is a real cut). */
export function productPrice(product: Pick<Product, 'price_npr' | 'discount_price_npr'>): number {
  const base = Number(product.price_npr);
  const discounted = Number(product.discount_price_npr);
  return product.discount_price_npr != null && discounted < base ? discounted : base;
}

export function productDiscountPercent(
  product: Pick<Product, 'price_npr' | 'discount_price_npr'>
): number | null {
  const base = Number(product.price_npr);
  const now = Number(product.discount_price_npr);
  if (!product.discount_price_npr || now >= base || base <= 0) return null;
  return Math.round(((base - now) / base) * 100);
}

/** Margin percentage, or null when no cost price has been recorded. */
export function productMarginPercent(
  product: Pick<Product, 'price_npr' | 'discount_price_npr' | 'cost_price_npr'>
): number | null {
  const sell = productPrice(product);
  const cost = Number(product.cost_price_npr);
  if (!product.cost_price_npr || cost <= 0 || sell <= 0) return null;
  return Math.round(((sell - cost) / sell) * 100);
}

/* -------------------------------------------------------------------- stock */

export function isLowStock(product: Pick<Product, 'stock_qty' | 'low_stock_threshold'>): boolean {
  return product.stock_qty > 0 && product.stock_qty <= product.low_stock_threshold;
}

export function isOutOfStock(product: Pick<Product, 'stock_qty'>): boolean {
  return product.stock_qty <= 0;
}

export function stockLabel(product: Pick<Product, 'stock_qty' | 'low_stock_threshold'>): string {
  if (isOutOfStock(product)) return 'Out of stock';
  if (isLowStock(product)) return `Only ${product.stock_qty} left`;
  return 'In stock';
}

/* --------------------------------------------------------------------- cart */

/**
 * Totals for the browser cart.
 *
 * `shipping` is an **estimate**, not the charged fee: it applies the threshold rule alone because
 * the cart does not know where the order is going. Since migration 0024 the charged fee also
 * depends on the destination (free in Attariya, flat across Kailali), so `deliveryFeeFor()` is the
 * authority and the cart says so in the UI. Treating this figure as final is what made the cart
 * promise "Free" to a customer the checkout then charged.
 */
export function cartTotals(
  lines: CartLine[],
  settings: Pick<SalonSettings, 'shipping_fee_npr' | 'free_shipping_threshold_npr'>
): CartTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price_npr * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const fee = Number(settings.shipping_fee_npr ?? 0);
  const threshold = Number(settings.free_shipping_threshold_npr ?? 0);
  const shipping = threshold > 0 && subtotal < threshold ? fee : 0;

  return {
    itemCount,
    subtotal,
    shipping,
    total: subtotal + shipping,
  };
}

/* --------------------------------------------------------------- aggregates */

/** Counts per status, for the admin board columns and filter chips. */
export function orderStatusCounts(orders: Pick<Order, 'status'>[]): Record<OrderStatus | 'all', number> {
  const counts = {
    all: orders.length,
    pending: 0,
    confirmed: 0,
    packed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  } as Record<OrderStatus | 'all', number>;

  for (const order of orders) counts[order.status] += 1;
  return counts;
}

/** Rolls orders up into one row per phone number (admin Customers screen). */
export function groupCustomers(orders: Order[]): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const existing = map.get(order.customer_phone);

    if (existing) {
      existing.order_count += 1;
      existing.total_spent_npr += Number(order.total_npr);
      if (order.created_at > existing.last_order_at) {
        existing.last_order_at = order.created_at;
        existing.name = order.customer_name;
        existing.city = order.delivery_city;
      }
    } else {
      map.set(order.customer_phone, {
        phone: order.customer_phone,
        name: order.customer_name,
        order_count: 1,
        total_spent_npr: Number(order.total_npr),
        last_order_at: order.created_at,
        city: order.delivery_city,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.total_spent_npr - a.total_spent_npr);
}

/** Sales KPIs derived from raw rows (used by the admin client in demo mode). */
export function deriveShopKpis(orders: Order[], products: Product[], todayIso: string): ShopKpis {
  const live = orders.filter((o) => o.status !== 'cancelled');
  const today = live.filter((o) => o.created_at.slice(0, 10) === todayIso);
  const monthPrefix = todayIso.slice(0, 7);

  return {
    ordersToday: today.length,
    revenueToday: today.reduce((sum, o) => sum + Number(o.total_npr), 0),
    ordersPending: orders.filter((o) => o.status === 'pending').length,
    ordersAwaitingFulfilment: orders.filter((o) => o.status === 'packed' || o.status === 'shipped').length,
    lowStockCount: products.filter((p) => p.is_active && isLowStock(p)).length,
    // Requires `items` to be loaded on the orders; orders fetched without line items
    // contribute 0 rather than an invented figure.
    unitsSoldThisMonth: live
      .filter((o) => o.created_at.slice(0, 7) === monthPrefix)
      .reduce(
        (sum, o) => sum + (o.items?.reduce((lineSum, item) => lineSum + item.quantity, 0) ?? 0),
        0
      ),
  };
}
