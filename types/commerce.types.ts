/**
 * Commerce contracts — the retail side of Alikati Beauty Home.
 *
 * Mirrors `supabase/migrations/20260928000004_ecommerce.sql`. Salon-side contracts live in
 * `types/database.types.ts`; these two modules together describe the whole database.
 */

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export type PaymentMethod = 'cod' | 'bank_transfer' | 'esewa' | 'khalti';

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  category_id: string | null;
  brand: string | null;
  short_description: string | null;
  description: string | null;
  price_npr: number;
  discount_price_npr: number | null;
  cost_price_npr: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  images: string[];
  /** Display-only variant metadata in v1, e.g. "Shade" with ["Rosewood", "Coral"]. */
  variant_label: string | null;
  variant_options: string[];
  tags: string[];
  is_active: boolean;
  is_featured: boolean;
  /**
   * Optional real customer rating (migration 0015). NULL means "no reviews yet" — the product
   * card then shows no stars rather than a fabricated score.
   */
  rating_average?: number | null;
  rating_count?: number;
  created_at: string;
  updated_at: string;
  /** Joined relation, present when the query selects `category:product_categories(...)`. */
  category?: Pick<ProductCategory, 'id' | 'name' | 'slug'>;
}

export interface Order {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_city: string;
  delivery_landmark: string | null;
  notes: string | null;
  /** Linked customer account, or `null` for a guest order. */
  customer_id?: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal_npr: number;
  /**
   * Coupon discount actually applied. Optional because rows written before migration 0008
   * predate the column; `place_order()` always writes it.
   */
  discount_npr?: number;
  shipping_npr: number;
  total_npr: number;
  coupon_code?: string | null;
  affiliate_code?: string | null;
  /** Affiliate commission earned on this order (subtotal × the affiliate's rate). */
  commission_npr?: number;
  /** Path in the private `payment-proofs` bucket holding the customer's payment statement. */
  payment_proof_url?: string | null;
  /** Transaction id / reference the customer typed in from their payment app. */
  payment_reference?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_slug: string | null;
  image_url: string | null;
  variant: string | null;
  unit_price_npr: number;
  quantity: number;
  line_total_npr: number;
  created_at: string;
}

/** One line in the browser cart (pre-checkout). */
export interface CartLine {
  product_id: string;
  slug: string;
  name: string;
  image_url: string | null;
  /** Price at the moment the line was added; re-validated server-side at checkout. */
  unit_price_npr: number;
  quantity: number;
  variant: string | null;
  stock_qty: number;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  shipping: number;
  total: number;
  freeShippingRemaining: number;
}

/** Request body for `POST /api/orders`. */
export interface OrderRequestPayload {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_city: string;
  delivery_landmark?: string;
  notes?: string;
  payment_method: PaymentMethod;
  items: Array<{ product_id: string; quantity: number; variant?: string | null }>;
  /** Optional linked customer account; guests omit it entirely. */
  customer_id?: string | null;
}

/** Response from `POST /api/orders`. */
export interface OrderResult {
  ok: boolean;
  order_id?: string;
  reference?: string;
  subtotal_npr?: number;
  discount_npr?: number;
  shipping_npr?: number;
  total_npr?: number;
  /** Set when a coupon actually reduced the order (server-verified). */
  coupon_code?: string | null;
  affiliate_code?: string | null;
  /** Echoed back so the confirmation screen can show what was attached. */
  payment_reference?: string | null;
  payment_proof_url?: string | null;
  whatsapp_url?: string;
  error?: string;
  /** Field-level validation messages keyed by payload field name. */
  fields?: Record<string, string>;
}

/** A customer aggregated from their orders (admin Customers screen). */
export interface CustomerSummary {
  phone: string;
  name: string;
  order_count: number;
  total_spent_npr: number;
  last_order_at: string;
  city: string;
}

/** Filters accepted by the product queries (storefront and admin share them). */
export interface ProductQuery {
  includeInactive?: boolean;
  categorySlug?: string;
  search?: string;
  featuredOnly?: boolean;
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'name';
  inStockOnly?: boolean;
  limit?: number;
}

/** Filters accepted by the order queries (admin). */
export interface OrderQuery {
  status?: OrderStatus;
  search?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive. */
  to?: string;
}

/** Sales-side dashboard counters. */
export interface ShopKpis {
  ordersToday: number;
  revenueToday: number;
  ordersPending: number;
  ordersAwaitingFulfilment: number;
  lowStockCount: number;
  unitsSoldThisMonth: number;
}
