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

/**
 * Every value an order may carry.
 *
 * `esewa` and `khalti` are retired: checkout no longer offers them and the order API rejects them
 * for new orders (see `SelectablePaymentMethod`). They remain in this union because historical
 * orders still carry them and the console, order confirmation and WhatsApp message all have to be
 * able to render those records. Removing them from the type would not delete the rows — it would
 * only make them unreadable.
 */
export type PaymentMethod = 'cod' | 'bank_transfer' | 'esewa' | 'khalti';

/** What checkout offers, and the only values the order API accepts for a new order. */
export type SelectablePaymentMethod = 'cod' | 'bank_transfer';

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

/**
 * Which service a payment destination belongs to. Mirrors the table's CHECK constraint, and drives
 * the tab the customer sees at checkout.
 */
export type PaymentProvider = 'esewa' | 'khalti' | 'bank' | 'other';

/** One payment destination the shop accepts — a wallet or a bank — each with its own QR. */
export interface PaymentAccount {
  id: string;
  /** The service the money goes to. */
  provider: PaymentProvider;
  /**
   * Optional display override. `null` names the account after its provider, which is the normal
   * case — it exists only so a shop with two accounts at the same provider can tell them apart.
   */
  label: string | null;
  /** Account holder or merchant name, e.g. "Nirmala Khadka". */
  account_name: string | null;
  /** Wallet/mobile number, or the bank account number. */
  account_identifier: string | null;
  /** Bank only; `null` for wallets. */
  bank_name: string | null;
  /** Bank only; `null` for wallets. */
  bank_branch: string | null;
  /** QR exported from the provider's own app. `null` renders this account without a code. */
  qr_image_url: string | null;
  instructions: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Which shelf a product sits on. Mirrors the `products.use_type` CHECK constraint (migration 0025):
 * `retail` is a walk-in purchase, `professional` is salon backbar / trade supply.
 */
export type ProductUseType = 'retail' | 'professional';

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
  /**
   * Sibling key linking sizes or strengths of one product (migration 0025). Rows that share it are
   * the same product in different options; `null` when the product stands alone. Kept as separate
   * rows on purpose, so each sibling keeps its own price and stock.
   */
  variant_group: string | null;
  /** This row's option inside its group, e.g. "100 gm" or "12%". `null` when there is no group. */
  variant_value: string | null;
  /**
   * The facets this product answers, from the five labels the shop filters by, e.g.
   * ["Acne & Blemish", "Whitening & Glow"]. Legitimately empty for hair care that answers none of
   * them (migration 0026) — such a product still shows whenever no concern filter is active.
   */
  concerns: string[];
  /**
   * Retail vs salon backbar. NOT NULL with a default of 'retail' in the database, so it is always
   * present; drives the shop's use-type tabs.
   */
  use_type: ProductUseType;
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
  /**
   * A pre-address estimate: the configured fee, waived above the threshold. It cannot know the
   * delivery district, so it is not necessarily what the customer is charged — `deliveryFeeFor()`
   * is authoritative, and the cart labels this figure as an estimate for that reason.
   */
  shipping: number;
  total: number;
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
  /** False when the payment reference/screenshot could not be stored with the order. */
  payment_details_saved?: boolean;
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
  /** 0-based page number (newest first). */
  page?: number;
  /** Orders per page, default 100, max 500. */
  pageSize?: number;
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
