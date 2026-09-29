/**
 * Types for the Well 10 Professional showcase (`/well10`).
 *
 * This is a curated brand presentation, deliberately separate from the shop catalogue: the
 * products here are on-the-shelf stock at the salon and are NOT `products` rows, so nothing in
 * this module is allowed to reach the cart or place an order. See `lib/well10-catalog.ts`.
 */

/** The three product families the section filters by. */
export type Well10Category = 'Treatments' | 'Shampoos' | 'Serums';

/** `'All'` is the unfiltered view; it is a UI state, not a real family. */
export type Well10Filter = 'All' | Well10Category;

export interface Well10Product {
  /** Stable slug — the React key, and the reference quoted in a WhatsApp enquiry. */
  slug: string;
  title: string;
  /** Retail price for one pack, in NPR. Supplied by the owner, not scraped. */
  priceNpr: number;
  /** What one pack is, e.g. `1000g Jar`. Shown as the size badge. */
  sizeLabel: string;
  /**
   * Units on the shelf. Mirrors `products.stock_qty` in the database — the shop is the system of
   * record, so this is a copy kept in step by hand. Drives the summary counters and the card badge.
   */
  stockQty: number;
  /** Canonical shop URL, so the showcase can hand off to the product page. */
  shopHref: string;
  category: Well10Category;
  /** Official supplier copy, reproduced verbatim. */
  description: string;
  /**
   * Alt text for the thumbnail, and the documented image-search query for this SKU.
   * Required even when `imageUrl` is absent, so a card with a missing photo is still accessible
   * and the owner has the exact query to source one.
   */
  imageAlt: string;
  /**
   * Official product page. Present only for the SKUs the supplier's store currently lists — an
   * unverified link is worse than no link, so it is omitted rather than guessed.
   */
  sourceUrl?: string;
  /**
   * Official photograph, hot-linked from the supplier's CDN. Requests are re-served through
   * `/api/product-image`, which puts the shot on white and stamps the salon's mark. Absent ⇒ the
   * card renders its fallback tile.
   */
  imageUrl?: string;
  /**
   * True when the photograph is an authentic shot of the same product line but not this exact
   * pack size. Surfaced in the UI so a 50 ml jar is never silently illustrated by a 100 ml photo.
   */
  imageIsRepresentative?: boolean;
}

/** Aggregate figures for a set of products — the order-summary counters. */
export interface Well10Summary {
  /** Number of product lines. */
  lines: number;
  /** Total units on the shelf across those lines. */
  units: number;
  /** `Σ price × stockQty`, in NPR. */
  valueNpr: number;
}
