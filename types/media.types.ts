/**
 * The admin media library (migration 0023).
 *
 * Editorial files only. Payment QRs are deliberately absent from this list even though they share
 * the same bucket: they are configuration that the checkout depends on, and a library grid with a
 * delete button is the wrong place to keep something whose removal breaks payments. They live under
 * `payment-qr/` and are managed from the payment card.
 */

/** A folder in the library. The four defaults are seeded and cannot be deleted. */
export interface MediaCategory {
  id: string;
  /** Also the storage folder, e.g. `product-images`. */
  slug: string;
  name: string;
  /** Seeded by the migration; protected from deletion in the database, not just the interface. */
  is_system: boolean;
  display_order: number;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  category_id: string | null;
  /** Object path inside the gallery bucket, e.g. `product-images/1727-abc.png`. */
  path: string;
  /** Public URL to embed. */
  url: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** A file type the library accepts, matching the bucket's own configuration. */
export const MEDIA_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
