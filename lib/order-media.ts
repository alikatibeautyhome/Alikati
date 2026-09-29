/**
 * Order-confirmation media read.
 *
 * The confirmation screen lives in a client component, so it may never touch Supabase itself.
 * This module is the small server-side read that turns an order reference into a thumbnail per
 * line item — resolved by product id through `getProductsByIds()` where possible, and falling
 * back to the image snapshot stored on `order_items`.
 *
 * It deliberately returns product-level data only (id / name / variant / image url). No customer
 * details, totals or addresses ever leave this function, so a bare reference cannot expose more
 * than what a public product listing already shows.
 *
 * Behaviour mirrors `lib/shop-api.ts`: the bundled demo store when Supabase is unconfigured, and
 * a logged, empty result (never fabricated content) if a configured query fails.
 */
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import { getProductsByIds } from '@/lib/shop-api';
import type { OrderItem } from '@/types/commerce.types';

export interface OrderLineMedia {
  product_id: string | null;
  /** Product name as captured on the order line; the client matches on this. */
  name: string;
  variant: string | null;
  image_url: string | null;
}

type MediaRow = Pick<OrderItem, 'product_id' | 'product_name' | 'variant' | 'image_url'>;

function toMedia(row: {
  product_id: string | null;
  product_name: string;
  variant: string | null;
  image_url: string | null;
}): MediaRow {
  return {
    product_id: row.product_id ?? null,
    product_name: row.product_name,
    variant: row.variant ?? null,
    image_url: row.image_url ?? null,
  };
}

/**
 * Thumbnails for every line of an order, in order. Returns `[]` (never throws) when the order
 * cannot be read, so the confirmation page still renders without images.
 */
export async function getOrderLineMedia(reference: string): Promise<OrderLineMedia[]> {
  const ref = reference.trim();
  if (!ref) return [];

  let rows: MediaRow[] = [];

  if (isDemoMode()) {
    const order = demoCommerceDb.getOrderByReference(ref);
    rows = (order?.items ?? []).map((item) =>
      toMedia({
        product_id: item.product_id ?? null,
        product_name: item.product_name,
        variant: item.variant ?? null,
        image_url: item.image_url ?? null,
      })
    );
  } else {
    try {
      // `orders` has no public RLS policy, so the read needs the service role; the public
      // client is the (safe) fallback when no service key is configured.
      const supabase = createAdminClient() ?? (await createClient());

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('reference', ref.toUpperCase())
        .maybeSingle();

      if (orderError) throw new Error(orderError.message);
      if (!order) return [];

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('product_id, product_name, variant, image_url')
        .eq('order_id', (order as { id: string }).id);

      if (itemsError) throw new Error(itemsError.message);

      rows = ((items ?? []) as Array<{
        product_id: string | null;
        product_name: string;
        variant: string | null;
        image_url: string | null;
      }>).map(toMedia);
    } catch (error) {
      console.error('[order-media] getOrderLineMedia failed:', error);
      return [];
    }
  }

  // Prefer the product's current photograph (it may have been re-shot since the order was
  // placed); the order line's own snapshot is the fallback.
  const ids = [
    ...new Set(rows.map((row) => row.product_id).filter((id): id is string => Boolean(id))),
  ];
  const byId = new Map<string, string>();
  if (ids.length > 0) {
    const products = await getProductsByIds(ids);
    for (const product of products) {
      const url = product.image_url ?? product.images?.[0] ?? null;
      if (url) byId.set(product.id, url);
    }
  }

  return rows.map((row) => ({
    product_id: row.product_id,
    name: row.product_name,
    variant: row.variant,
    image_url: (row.product_id ? byId.get(row.product_id) : null) ?? row.image_url ?? null,
  }));
}
