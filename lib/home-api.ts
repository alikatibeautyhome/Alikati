/**
 * Server-side reads for the storefront landing page.
 *
 * This module only ever composes the existing, read-only `lib/shop-api` helpers — it adds no SQL
 * and touches no database object of its own. Counting and image-picking happen in JavaScript so
 * the landing page costs exactly two queries regardless of how many categories the shop has.
 *
 * Import from a Server Component only: like `lib/shop-api`, it reaches the server Supabase client
 * (and therefore `next/headers`) underneath.
 */
import { getProductCategories, getProducts } from '@/lib/shop-api';

/** One "Shop by Category" tile on the landing page. */
export interface CategoryTile {
  name: string;
  slug: string;
  /** Category banner if the owner uploaded one, else a product photo, else `null`. */
  image_url: string | null;
  /** Number of active products in the category. Always ≥ 1 — empty categories are dropped. */
  product_count: number;
}

/**
 * Builds the tiles shown in the "Shop by Category" row.
 *
 * Rules (all deliberate):
 *   • Only active categories that actually contain at least one active product are returned, so
 *     the row can never link a shopper to an empty shelf.
 *   • `getProducts({})` already filters to active products; the extra `is_active` guard below is
 *     belt-and-braces for the demo store and any future caller.
 *   • The image prefers the category banner, then falls back to the first (newest) product photo
 *     that has one — never a fabricated URL.
 *   • Display order follows the category order `getProductCategories` already returned
 *     (`display_order`, then name).
 */
export async function getCategoryTiles(): Promise<CategoryTile[]> {
  const [categories, products] = await Promise.all([getProductCategories(), getProducts({})]);

  if (categories.length === 0) return [];

  const countByCategory = new Map<string, number>();
  const imageByCategory = new Map<string, string>();

  for (const product of products) {
    if (!product.is_active) continue;
    const categoryId = product.category_id;
    if (!categoryId) continue;

    countByCategory.set(categoryId, (countByCategory.get(categoryId) ?? 0) + 1);

    const image = product.image_url?.trim();
    if (image && !imageByCategory.has(categoryId)) imageByCategory.set(categoryId, image);
  }

  const tiles: CategoryTile[] = [];
  for (const category of categories) {
    const product_count = countByCategory.get(category.id) ?? 0;
    if (product_count === 0) continue;

    tiles.push({
      name: category.name,
      slug: category.slug,
      image_url: category.image_url?.trim() || imageByCategory.get(category.id) || null,
      product_count,
    });
  }

  return tiles;
}
