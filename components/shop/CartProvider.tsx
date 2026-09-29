'use client';

import * as React from 'react';
import type { CartLine, CartTotals, Product } from '@/types/commerce.types';
import type { SalonSettings } from '@/types/database.types';
import {
  CART_STORAGE_KEY,
  addLine,
  cartLineKey,
  lineFromProduct,
  parseCart,
  removeLine,
  serializeCart,
  setLineQuantity,
} from '@/lib/cart';
import { cartTotals } from '@/lib/commerce';

type StoreSettings = Pick<SalonSettings, 'shipping_fee_npr' | 'free_shipping_threshold_npr'>;

interface CartContextValue {
  lines: CartLine[];
  totals: CartTotals;
  /** False until localStorage has been read, so the badge does not flash 0 → n. */
  hydrated: boolean;
  addProduct: (product: Product, quantity?: number, variant?: string | null) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  keyOf: typeof cartLineKey;
}

const CartContext = React.createContext<CartContextValue | null>(null);

/**
 * Cart state for the storefront. Prices here are display-only — the checkout endpoint
 * re-prices every line against the catalogue before an order is created.
 */
export function CartProvider({
  settings,
  children,
}: {
  settings: StoreSettings;
  children: React.ReactNode;
}) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  // Read the persisted cart after mount (never during render — keeps SSR output stable).
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setLines(parseCart(window.localStorage.getItem(CART_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(lines));
  }, [lines, hydrated]);

  const addProduct = React.useCallback(
    (product: Product, quantity = 1, variant: string | null = null) => {
      setLines((current) => addLine(current, lineFromProduct(product, quantity, variant)));
    },
    []
  );

  const value: CartContextValue = {
    lines,
    totals: cartTotals(lines, settings),
    hydrated,
    addProduct,
    setQuantity: (key, quantity) => setLines((current) => setLineQuantity(current, key, quantity)),
    remove: (key) => setLines((current) => removeLine(current, key)),
    clear: () => setLines([]),
    keyOf: cartLineKey,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = React.useContext(CartContext);
  if (!context) throw new Error('useCart() must be used inside <CartProvider>.');
  return context;
}
