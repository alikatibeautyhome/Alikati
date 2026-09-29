/**
 * Server-side review reads (Server Components, metadata, route handlers).
 *
 * Only ever returns **approved** reviews — the RLS policy enforces that too, so a mistake here
 * cannot publish an unmoderated row. Browser-side moderation lives in `lib/reviews-admin-api.ts`;
 * do not import this module from a client component, it reaches `next/headers` underneath.
 *
 * Behaviour matches `lib/shop-api.ts`: an empty list (never fabricated content) when Supabase is
 * unconfigured, and a logged empty list if a configured query fails.
 */
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import type { PublicReview } from '@/types/reviews.types';

/**
 * Logs a read failure and returns `fallback`.
 *
 * `DYNAMIC_SERVER_USAGE` is next.js telling us the route must be dynamic (it touched
 * `cookies()`); re-throwing it is what stops the reviews section being prerendered empty.
 * See the matching helper in `lib/shop-api.ts`.
 */
function degraded<T>(context: string, error: unknown, fallback: T): T {
  if (typeof error === 'object' && error !== null && 'digest' in error) {
    if ((error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE') throw error;
  }
  console.error(`[reviews-api] ${context} failed:`, error);
  return fallback;
}

/** Columns a visitor may see. `author_email` is absent on purpose. */
const PUBLIC_SELECT = 'id, author_name, service_label, rating, body, created_at';

/**
 * The reviews shown in the landing-page carousel: approved only, newest first.
 *
 * In demo mode this returns an empty list rather than the old hardcoded quotes. Unconfigured
 * Supabase is a preview with no moderation queue, so there is no way for a visitor to submit a
 * review that anyone could approve — showing the empty state is the honest outcome, and the
 * component hides the form in that mode.
 */
export async function getApprovedReviews(limit = 12): Promise<PublicReview[]> {
  if (isDemoMode()) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('reviews')
      .select(PUBLIC_SELECT)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return degraded('getApprovedReviews', error, [] as PublicReview[]);
    return (data ?? []) as PublicReview[];
  } catch (error) {
    return degraded('getApprovedReviews', error, [] as PublicReview[]);
  }
}
