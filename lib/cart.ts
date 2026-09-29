/**
 * Cart helpers — pure functions operating on `CartLine[]`.
 *
 * Kept free of React so they can be unit-tested and reused on the server. The React binding
 * lives in `components/shop/CartProvider.tsx`.
 *
 * The cart is a *convenience cache only*: every price, stock level and total is re-derived
 * server-side by `place_order()` at checkout, so a tampered localStorage entry cannot change
 * what a customer is charged.
 */
import type { CartLine } from '@/types/commerce.types';
import type { Product } from '@/types/commerce.types';
import { productPrice } from '@/lib/commerce';

export const CART_STORAGE_KEY = 'abh_cart_v1';
export const MAX_QTY_PER_LINE = 20;

/** A line is unique per product AND variant. */
export function cartLineKey(line: Pick<CartLine, 'product_id' | 'variant'>): string {
  return `${line.product_id}::${line.variant ?? ''}`;
}

/** Builds a cart line from a catalogue product. */
export function lineFromProduct(
  product: Product,
  quantity = 1,
  variant: string | null = null
): CartLine {
  return {
    product_id: product.id,
    slug: product.slug,
    name: product.name,
    image_url: product.image_url,
    unit_price_npr: productPrice(product),
    quantity: clampQuantity(quantity, product.stock_qty),
    variant,
    stock_qty: product.stock_qty,
  };
}

export function clampQuantity(quantity: number, stockQty: number): number {
  const ceiling = Math.min(MAX_QTY_PER_LINE, Math.max(0, stockQty));
  return Math.max(1, Math.min(quantity, Math.max(1, ceiling)));
}

/** Adds a line, merging with an existing line for the same product + variant. */
export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const key = cartLineKey(incoming);

  const existing = lines.find((line) => cartLineKey(line) === key);
  if (!existing) return [...lines, incoming];

  return lines.map((line) =>
    cartLineKey(line) === key
      ? {
          ...line,
          // Refresh the cached price/stock/name from the latest catalogue read.
          unit_price_npr: incoming.unit_price_npr,
          stock_qty: incoming.stock_qty,
          name: incoming.name,
          slug: incoming.slug,
          image_url: incoming.image_url,
          quantity: clampQuantity(line.quantity + incoming.quantity, incoming.stock_qty),
        }
      : line
  );
}

export function setLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return removeLine(lines, key);
  return lines.map((line) =>
    cartLineKey(line) === key ? { ...line, quantity: clampQuantity(quantity, line.stock_qty) } : line
  );
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => cartLineKey(line) !== key);
}

/** Drops lines whose product has since been deactivated or sold out. */
export function pruneUnavailable(lines: CartLine[], available: Product[]): CartLine[] {
  const byId = new Map(available.map((product) => [product.id, product]));

  return lines
    .map((line) => {
      const product = byId.get(line.product_id);
      if (!product || !product.is_active || product.stock_qty <= 0) return null;

      return {
        ...line,
        name: product.name,
        slug: product.slug,
        image_url: product.image_url,
        unit_price_npr: productPrice(product),
        stock_qty: product.stock_qty,
        quantity: clampQuantity(line.quantity, product.stock_qty),
      } satisfies CartLine;
    })
    .filter((line): line is CartLine => line !== null);
}

/* ------------------------------------------------------------ persistence */

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((line): line is CartLine => {
      if (typeof line !== 'object' || line === null) return false;
      const candidate = line as Partial<CartLine>;
      return (
        typeof candidate.product_id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.unit_price_npr === 'number' &&
        typeof candidate.quantity === 'number' &&
        candidate.quantity > 0
      );
    });
  } catch {
    return [];
  }
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify(lines);
}

/** Payload sent to `POST /api/orders` — the minimum the server needs. */
export function toOrderItems(lines: CartLine[]) {
  return lines.map((line) => ({
    product_id: line.product_id,
    quantity: line.quantity,
    variant: line.variant,
  }));
}
