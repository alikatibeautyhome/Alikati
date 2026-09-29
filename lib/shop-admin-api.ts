/**
 * Client-side commerce access for the admin console (products, categories, orders, customers).
 *
 * Every call runs in the browser against Supabase under RLS, using the signed-in staff
 * session. In demo mode the same functions operate on the in-memory demo store, so the admin
 * panel is fully explorable without a database.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import { deriveShopKpis } from '@/lib/commerce';
import type {
  CustomerSummary,
  Order,
  OrderQuery,
  OrderStatus,
  Product,
  ProductCategory,
  ProductQuery,
  ShopKpis,
} from '@/types/commerce.types';
import { todayISO } from '@/lib/utils';

function db() {
  if (typeof window === 'undefined') {
    throw new Error('lib/shop-admin-api.ts is browser-only. Use lib/shop-api.ts on the server.');
  }
  return getSupabaseBrowserClient();
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as T;
}

const PRODUCT_SELECT = '*, category:product_categories(id, name, slug)';

/* -------------------------------------------------------------- categories */

export async function getProductCategories(includeInactive = true): Promise<ProductCategory[]> {
  if (isDemoMode()) return demoCommerceDb.getCategories(includeInactive);

  let query = db().from('product_categories').select('*');
  if (!includeInactive) query = query.eq('is_active', true);

  return unwrap(
    await query.order('display_order', { ascending: true }).order('name', { ascending: true }),
    'getProductCategories'
  ) as ProductCategory[];
}

export async function upsertCategory(
  input: Partial<ProductCategory> & { name: string; slug: string }
): Promise<ProductCategory> {
  if (isDemoMode()) return demoCommerceDb.upsertCategory(input);

  return unwrap(
    await db().from('product_categories').upsert(input, { onConflict: 'id' }).select().single(),
    'upsertCategory'
  ) as ProductCategory;
}

export async function deleteCategory(id: string): Promise<void> {
  if (isDemoMode()) return demoCommerceDb.deleteCategory(id);

  const { error } = await db().from('product_categories').delete().eq('id', id);
  if (error) throw new Error(`deleteCategory: ${error.message}`);
}

/* ---------------------------------------------------------------- products */

export async function getProducts(query: ProductQuery = {}): Promise<Product[]> {
  const {
    includeInactive = false,
    categorySlug,
    search,
    featuredOnly,
    sort = 'newest',
    inStockOnly,
    limit,
  } = query;

  if (isDemoMode()) return demoCommerceDb.getProducts(query);

  const supabase = db();

  let categoryId: string | null = null;
  if (categorySlug) {
    const category = unwrap(
      await supabase.from('product_categories').select('id').eq('slug', categorySlug).maybeSingle(),
      'getProducts/category'
    ) as { id: string } | null;
    categoryId = category?.id ?? '__none__';
  }

  let builder = supabase.from('products').select(PRODUCT_SELECT);
  if (!includeInactive) builder = builder.eq('is_active', true);
  if (categoryId) builder = builder.eq('category_id', categoryId);
  if (featuredOnly) builder = builder.eq('is_featured', true);
  if (inStockOnly) builder = builder.gt('stock_qty', 0);
  if (search) builder = builder.or(`name.ilike.%${search}%,brand.ilike.%${search}%,short_description.ilike.%${search}%`);

  const rows = unwrap(await builder, 'getProducts') as Product[];

  rows.sort((a, b) => {
    const price = (p: Product) =>
      p.discount_price_npr != null && p.discount_price_npr < p.price_npr ? p.discount_price_npr : p.price_npr;
    switch (sort) {
      case 'price-asc':
        return price(a) - price(b);
      case 'price-desc':
        return price(b) - price(a);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name);
    }
  });

  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}

export async function getProductById(id: string): Promise<Product | null> {
  if (isDemoMode()) return demoCommerceDb.getProductById(id);

  return unwrap(
    await db().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle(),
    'getProductById'
  ) as Product | null;
}

export async function upsertProduct(
  input: Partial<Product> & { name: string; slug: string }
): Promise<Product> {
  if (isDemoMode()) return demoCommerceDb.upsertProduct(input);

  return unwrap(
    await db().from('products').upsert(input, { onConflict: 'id' }).select(PRODUCT_SELECT).single(),
    'upsertProduct'
  ) as Product;
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
  if (isDemoMode()) return demoCommerceDb.updateProduct(id, patch);

  return unwrap(
    await db().from('products').update(patch).eq('id', id).select(PRODUCT_SELECT).single(),
    'updateProduct'
  ) as Product;
}

/** Positive delta restocks, negative delta writes off damaged units. */
export async function adjustStock(id: string, delta: number): Promise<Product> {
  if (isDemoMode()) return demoCommerceDb.adjustStock(id, delta);

  const current = await getProductById(id);
  if (!current) throw new Error('Product not found.');
  return updateProduct(id, { stock_qty: Math.max(0, current.stock_qty + delta) });
}

export async function deleteProduct(id: string): Promise<void> {
  if (isDemoMode()) return demoCommerceDb.deleteProduct(id);

  const { error } = await db().from('products').delete().eq('id', id);
  if (error) throw new Error(`deleteProduct: ${error.message}`);
}

/**
 * Upload a product image to the public `products` bucket and return its CDN URL.
 * Keys are `${yyyy-mm}/${uuid}.${ext}` — unenumerable and collision-free.
 */
export async function uploadProductImage(file: File): Promise<string> {
  if (isDemoMode()) return URL.createObjectURL(file);

  const ext = (file.name.split('.').pop() ?? 'webp').toLowerCase();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const path = `${month}/${crypto.randomUUID()}.${ext}`;

  const supabase = db();
  const { error } = await supabase.storage
    .from('products')
    .upload(path, file, { upsert: false, cacheControl: '31536000' });

  if (error) throw new Error(`uploadProductImage: ${error.message}`);

  return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
}

/* --------------------------------------------------- payment statements ── */

/** Bucket holding customers' payment screenshots. Private — staff read via signed URLs. */
export const PAYMENT_PROOF_BUCKET = 'payment-proofs';

/** 5 MB, matching the bucket's own limit, so we can reject early with a clear message. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export interface ProofUploadResult {
  ok: boolean;
  /** Object key to send with the order: the server stores this, never a full URL. */
  key?: string;
  error?: string;
}

/**
 * Uploads a payment screenshot from the checkout screen.
 *
 * Runs as the anonymous browser client on purpose: a guest must be able to prove payment
 * without creating an account. The bucket is private and write-only for the public, so the
 * file cannot be read back without a signed URL issued to staff.
 */
export async function uploadPaymentProof(file: File): Promise<ProofUploadResult> {
  if (!file) return { ok: false, error: 'Choose a file first.' };
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false, error: 'That file is larger than 5 MB. Please upload a smaller image.' };
  }
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'];
  if (file.type && !allowed.includes(file.type)) {
    return { ok: false, error: 'Use a PNG, JPG, WEBP, HEIC or PDF file.' };
  }

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const month = new Date().toISOString().slice(0, 7);
  const key = `${month}/${crypto.randomUUID()}.${extension || 'jpg'}`;

  if (isDemoMode()) {
    // Nothing is stored in demo mode; the confirmation screen still shows that a file was chosen.
    return { ok: true, key: `demo/${key}` };
  }

  const supabase = db();
  const { error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .upload(key, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

  if (error) {
    console.error('[shop-admin-api] payment proof upload failed:', error.message);
    return { ok: false, error: 'Upload failed. You can send the screenshot on WhatsApp instead.' };
  }
  return { ok: true, key };
}

/** Time-limited URL for staff to view a customer's payment statement. */
export async function getPaymentProofUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!key || isDemoMode()) return null;
  const supabase = db();
  const { data, error } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) {
    console.error('[shop-admin-api] could not sign payment proof:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/* ------------------------------------------------------------------ orders */

export async function getOrders(query: OrderQuery = {}): Promise<Order[]> {
  if (isDemoMode()) return demoCommerceDb.getOrders(query);

  const { status, search, from, to } = query;
  const supabase = db();

  let builder = supabase.from('orders').select('*, items:order_items(*)');
  if (status) builder = builder.eq('status', status);
  if (from) builder = builder.gte('created_at', `${from}T00:00:00`);
  if (to) builder = builder.lte('created_at', `${to}T23:59:59`);
  if (search) builder = builder.or(`reference.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);

  const rows = unwrap(await builder.order('created_at', { ascending: false }), 'getOrders') as Order[];
  return rows;
}

export async function getOrderById(id: string): Promise<Order | null> {
  if (isDemoMode()) return demoCommerceDb.getOrderById(id);

  return unwrap(
    await db().from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle(),
    'getOrderById'
  ) as Order | null;
}

/**
 * Advance an order. Cancelling goes through the `cancel_order` RPC so the reserved stock is
 * returned to the catalogue in the same transaction.
 */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  if (isDemoMode()) return demoCommerceDb.updateOrderStatus(id, status);

  const supabase = db();

  if (status === 'cancelled') {
    const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
    if (error) throw new Error(`cancel_order: ${error.message}`);
    const refreshed = await getOrderById(id);
    if (!refreshed) throw new Error('Order not found after cancelling.');
    return refreshed;
  }

  return unwrap(
    await supabase
      .from('orders')
      .update({
        status,
        // Cash on delivery is collected at the door.
        ...(status === 'delivered' ? { payment_status: 'paid' as const } : {}),
      })
      .eq('id', id)
      .select('*, items:order_items(*)')
      .single(),
    'updateOrderStatus'
  ) as Order;
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order> {
  if (isDemoMode()) return demoCommerceDb.updateOrder(id, patch);

  return unwrap(
    await db().from('orders').update(patch).eq('id', id).select('*, items:order_items(*)').single(),
    'updateOrder'
  ) as Order;
}

export async function deleteOrder(id: string): Promise<void> {
  if (isDemoMode()) {
    return;
  }
  const { error } = await db().from('orders').delete().eq('id', id);
  if (error) throw new Error(`deleteOrder: ${error.message}`);
}

/* --------------------------------------------------------------- customers */

export async function getCustomers(): Promise<CustomerSummary[]> {
  if (isDemoMode()) return demoCommerceDb.getCustomers();

  // Customers are derived from orders; computing in JS keeps one source of truth.
  const orders = unwrap(
    await db().from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }),
    'getCustomers'
  ) as Order[];

  const { groupCustomers } = await import('@/lib/commerce');
  return groupCustomers(orders);
}

/* ---------------------------------------------------------------- reporting */

export async function getShopKpis(): Promise<ShopKpis> {
  if (isDemoMode()) return demoCommerceDb.getShopKpis();

  const supabase = db();
  const today = todayISO();

  // Prefer the SQL aggregate; fall back to client-side derivation if it is unavailable.
  const { data, error } = await supabase.rpc('shop_kpis');

  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null;
    if (row) {
      return {
        ordersToday: Number(row.orders_today ?? 0),
        revenueToday: Number(row.revenue_today ?? 0),
        ordersPending: Number(row.orders_pending ?? 0),
        ordersAwaitingFulfilment: Number(row.orders_shipped ?? 0),
        lowStockCount: Number(row.low_stock_count ?? 0),
        unitsSoldThisMonth: Number(row.units_sold_month ?? 0),
      };
    }
  }

  const [orders, products] = await Promise.all([getOrders(), getProducts({ includeInactive: true })]);
  return deriveShopKpis(orders, products, today);
}
