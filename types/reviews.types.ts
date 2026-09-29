/**
 * Customer reviews.
 *
 * Submitted through the public form on the landing page, held as `pending`, and only shown on
 * the site once a staff member approves them in /admin/reviews.
 */

/**
 * A review as the public page sees it.
 *
 * No contact details exist on a review row at all — see the note in migration 0016 §1. Anything
 * stored in `public.reviews` is readable by anyone holding the publishable key, because RLS is
 * row-level and cannot hide a column.
 */
export interface PublicReview {
  id: string;
  author_name: string;
  service_label: string | null;
  rating: number;
  body: string;
  created_at: string;
}

/**
 * A complete row, as the admin console sees it.
 *
 * `approved_by` is intentionally not part of this type: the column grants in migration 0016 keep
 * it out of reach of every browser-authenticated role, so the console cannot select it.
 */
export interface Review extends PublicReview {
  is_approved: boolean;
  approved_at: string | null;
  /** `website` | `imported` | `admin` — where the row came from. */
  source: string;
}

/** What the public form sends. Every field is re-validated server-side. */
export interface ReviewSubmission {
  author_name: string;
  service_label?: string | null;
  rating: number;
  body: string;
}

/** Result of a public submission. */
export interface ReviewSubmitResult {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
  /** True when the row was stored and is waiting for staff approval. */
  pending?: boolean;
}
