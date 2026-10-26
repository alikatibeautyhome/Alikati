/**
 * Server-side commerce reads (Server Components, metadata, route handlers).
 *
 * Browser-side admin access lives in `lib/shop-admin-api.ts`; do not import this module from
 * a client component — it reaches `next/headers` through the server Supabase client.
 *
 * Behaviour matches `lib/api.ts`: demo store when Supabase is unconfigured, and a logged,
 * empty result (never fabricated content) if a configured query fails.
 */
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import { productPrice } from '@/lib/commerce';
import type {
  Order,
  OrderItem,
  PaymentAccount,
  Product,
  ProductCategory,
  ProductQuery,
} from '@/types/commerce.types';

/**
 * Logs a read failure and returns `fallback`.
 *
 * `DYNAMIC_SERVER_USAGE` is next.js telling us the route must be dynamic (it touched
 * `cookies()`); re-throwing it is what stops the catalogue being prerendered empty. See the
 * matching helper in `lib/api.ts`.
 */
function degraded<T>(context: string, error: unknown, fallback: T): T {
  if (typeof error === 'object' && error !== null && 'digest' in error) {
    if ((error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE') throw error;
  }
  console.error(`[shop-api] ${context} failed:`, error);
  return fallback;
}

const PRODUCT_SELECT =
  '*, category:product_categories(id, name, slug)';

/* ---------------------------------------------------------------- catalogue */

export async function getProductCategories(includeInactive = false): Promise<ProductCategory[]> {
  if (isDemoMode()) return demoCommerceDb.getCategories(includeInactive);

  try {
    const supabase = await createClient();
    let query = supabase.from('product_categories').select('*');
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded('getProductCategories', error, []);
  }
}

export async function getProducts(query: ProductQuery = {}): Promise<Product[]> {
  const { includeInactive = false, categorySlug, search, featuredOnly, sort = 'newest', inStockOnly, limit } = query;

  if (isDemoMode()) return demoCommerceDb.getProducts(query);

  try {
    const supabase = await createClient();

    // Resolve the category slug to an id first (one small extra round trip).
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: category } = await supabase
        .from('product_categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle();
      categoryId = category?.id ?? '__none__';
    }

    let builder = supabase.from('products').select(PRODUCT_SELECT);
    if (!includeInactive) builder = builder.eq('is_active', true);
    if (categoryId) builder = builder.eq('category_id', categoryId);
    if (featuredOnly) builder = builder.eq('is_featured', true);
    if (inStockOnly) builder = builder.gt('stock_qty', 0);
    if (search) builder = builder.or(`name.ilike.%${search}%,brand.ilike.%${search}%,short_description.ilike.%${search}%`);

    // Newest/name sorts run in SQL with the limit applied there, so the page never downloads
    // the whole catalogue. Price sorts depend on the discount, so they still sort in JS, but
    // are capped to stay within the API's row limit.
    const priceSort = sort === 'price-asc' || sort === 'price-desc';
    const sqlLimit = typeof limit === 'number' && !priceSort ? limit : 1000;
    const ordered =
      sort === 'name'
        ? builder.order('name', { ascending: true })
        : priceSort
          ? builder
          : builder.order('created_at', { ascending: false }).order('name', { ascending: true });

    const { data, error } = await ordered.limit(sqlLimit);
    if (error) throw new Error(error.message);

    // Sorting happens in JS so live and demo modes order identically — including
    // discount-aware price sorting, which SQL cannot express without a computed column.
    const rows = (data ?? []) as Product[];
    rows.sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return productPrice(a) - productPrice(b);
        case 'price-desc':
          return productPrice(b) - productPrice(a);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name);
      }
    });

    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
  } catch (error) {
    return degraded('getProducts', error, []);
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (isDemoMode()) return demoCommerceDb.getProductBySlug(slug);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as Product) ?? null;
  } catch (error) {
    return degraded(`getProductBySlug(${slug})`, error, null);
  }
}

/**
 * The sibling sizes/strengths of one product (migration 0025).
 *
 * Each sibling is its own row with its own price and stock — that is the whole point of the model
 * — so the product page links to the sibling rather than deriving anything from the current row.
 * Ordered numerically-ish (`3%`, `6%`, `9%`, `12%` rather than `12%` first).
 */
export async function getProductVariants(group: string): Promise<Product[]> {
  if (!group) return [];

  if (isDemoMode()) return demoCommerceDb.getProductVariants(group);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .eq('variant_group', group);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Product[];
    return rows.sort((a, b) =>
      (a.variant_value ?? a.name).localeCompare(b.variant_value ?? b.name, undefined, {
        numeric: true,
      })
    );
  } catch (error) {
    return degraded(`getProductVariants(${group})`, error, []);
  }
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  return getProducts({ featuredOnly: true, sort: 'newest', limit });
}

/**
 * The payment destinations the shop currently accepts, in the owner's chosen order.
 *
 * Read on the server so the checkout arrives with the QRs already in the markup rather than popping
 * in after hydration — someone on a slow connection should see where to send money as soon as the
 * page paints.
 *
 * Public by design: checkout has to show a visitor where to pay before they have any account, and
 * the table holds nothing but the shop's own published account numbers. The read policy returns
 * active rows only, so this cannot surface a switched-off account either.
 *
 * An empty list is a normal state rather than an error — it is what a shop with no accounts
 * configured looks like, and the checkout then falls back to the single QR on `salon_settings`.
 */
export async function getActivePaymentAccounts(): Promise<PaymentAccount[]> {
  if (isDemoMode()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('label', { ascending: true });

    if (error) throw error;
    return (data ?? []) as PaymentAccount[];
  } catch (error) {
    return degraded('getActivePaymentAccounts', error, []);
  }
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  if (!product.category_id) return [];

  if (isDemoMode()) return demoCommerceDb.getRelatedProducts(product, limit);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as Product[];
  } catch (error) {
    return degraded('getRelatedProducts', error, []);
  }
}

/** Used by the cart screen to re-price lines against the current catalogue. */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  if (isDemoMode()) {
    return ids
      .map((id) => demoCommerceDb.getProductById(id))
      .filter((product): product is Product => product !== null);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).in('id', ids);

    if (error) throw new Error(error.message);
    return (data ?? []) as Product[];
  } catch (error) {
    return degraded('getProductsByIds', error, []);
  }
}

/* ------------------------------------------------------------------- orders */

/**
 * Customer-facing order lookup. Requires the phone number on the order as a shared secret,
 * so a reference alone cannot expose someone else's delivery address.
 */
export async function lookupOrder(
  reference: string,
  phone: string
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const normalise = (value: string) => value.replace(/[^0-9]/g, '').slice(-10);
  const wantedPhone = normalise(phone);

  if (isDemoMode()) {
    const order = demoCommerceDb.getOrderByReference(reference);
    if (!order || normalise(order.customer_phone) !== wantedPhone) return null;
    return { order, items: order.items ?? [] };
  }

  try {
    // `orders` has no public RLS policy, so this read requires the service role. It is only
    // reachable from server code with the phone number as a shared secret.
    const supabase = createAdminClient() ?? (await createClient());
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('reference', reference.toUpperCase())
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) return null;
    if (normalise(order.customer_phone) !== wantedPhone) return null;

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);

    if (itemsError) throw new Error(itemsError.message);

    return { order: order as Order, items: (items ?? []) as OrderItem[] };
  } catch (error) {
    return degraded('lookupOrder', error, null);
  }
}
