/**
 * Low-stock alerting.
 *
 * There is deliberately **no server-side WhatsApp integration** anywhere in this project — see
 * `lib/whatsapp.ts`, where every message is a `wa.me` link the user taps. Stock alerts follow the
 * same pattern: the console raises the alert in-app and with a sound, and offers a one-tap
 * WhatsApp message to the owner. Fully automatic sending would need a WhatsApp Business API
 * provider and credentials, which this project does not have.
 *
 * The threshold itself is per-product (`products.low_stock_threshold`, default 5). `lib/commerce.ts`
 * owns the shop's own vocabulary for this and is left alone: its `isLowStock` deliberately excludes
 * zero because the shop calls that "out of stock" rather than "low". An *alert* cares about both, so
 * the boundary is restated here rather than editing a protected module.
 */

import type { Product } from '@/types/commerce.types';

/** The fields the alert needs. Kept narrow so a query can select exactly these. */
export type StockAlertProduct = Pick<
  Product,
  'id' | 'name' | 'slug' | 'stock_qty' | 'low_stock_threshold'
>;

/** `true` when the shelf needs attention: at or below its threshold, or empty. */
export function needsStockAlert(product: Pick<Product, 'stock_qty' | 'low_stock_threshold'>): boolean {
  return product.stock_qty <= product.low_stock_threshold;
}

/** Empty shelf. Ranked above merely-low, because it is the one that loses a sale outright. */
export function isOutOfStock(product: Pick<Product, 'stock_qty'>): boolean {
  return product.stock_qty <= 0;
}

/** Worst first, then alphabetically, so the list reads as a to-do rather than a dump. */
export function sortByUrgency(products: readonly StockAlertProduct[]): StockAlertProduct[] {
  return [...products].sort((a, b) => {
    if (isOutOfStock(a) !== isOutOfStock(b)) return isOutOfStock(a) ? -1 : 1;
    if (a.stock_qty !== b.stock_qty) return a.stock_qty - b.stock_qty;
    return a.name.localeCompare(b.name);
  });
}

/** The message the owner receives on WhatsApp, or `null` when there is nothing to report. */
export function createStockAlertLink(
  products: readonly StockAlertProduct[],
  whatsappNumber: string | null | undefined,
  normalize: (value: string) => string
): string | null {
  const phone = normalize(whatsappNumber ?? '');
  if (!phone || products.length === 0) return null;

  const rule = '--------------------------------------';
  const lines = sortByUrgency(products).map((product) => {
    const state = isOutOfStock(product) ? 'OUT OF STOCK' : `only ${product.stock_qty} left`;
    return `• ${product.name} — ${state}`;
  });

  const text =
    `*⚠️ Low Stock Alert — Alikati Beauty Home*\n` +
    `${rule}\n` +
    `${products.length} ${products.length === 1 ? 'item needs' : 'items need'} restocking:\n` +
    `${lines.join('\n')}\n` +
    `${rule}\n` +
    `Please arrange a restock.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
