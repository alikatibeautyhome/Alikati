/**
 * Review moderation for the admin console.
 *
 * Browser-only, like `lib/shop-admin-api.ts` and `lib/marketing-api.ts`: every call goes through
 * the browser client and relies on RLS plus the signed-in staff session for authorisation. The
 * policies in migration 0016 let staff read every row (including the pending queue) and update
 * them, and let only an admin delete — so nothing here needs the service key, and nothing here
 * can widen access on its own.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';
import type { Review } from '@/types/reviews.types';

export type ReviewFilter = 'pending' | 'approved' | 'all';

/** Browser client accessor — throws if accidentally executed on the server. */
function db() {
  if (typeof window === 'undefined') {
    throw new Error('reviews-admin-api is browser-only; use lib/reviews-api.ts on the server.');
  }
  return getSupabaseBrowserClient();
}

const DEMO_MESSAGE =
  'Review moderation needs a configured database — this preview is running without one.';

/**
 * The columns the console selects.
 *
 * Named explicitly rather than `*`: migration 0016 revokes table-wide SELECT from `anon` and
 * `authenticated` and grants only these columns, so `select=*` — which would also request
 * `approved_by` — is rejected by PostgREST with a permission error.
 */
const REVIEW_COLUMNS =
  'id, author_name, service_label, rating, body, is_approved, approved_at, source, created_at';

/** Every review, newest first, optionally filtered by moderation state. */
export async function getReviews(filter: ReviewFilter = 'all'): Promise<Review[]> {
  if (isDemoMode()) return [];

  const supabase = db();
  let query = supabase.from('reviews').select(REVIEW_COLUMNS).order('created_at', { ascending: false });
  if (filter === 'pending') query = query.eq('is_approved', false);
  if (filter === 'approved') query = query.eq('is_approved', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Review[];
}

/**
 * Approves or un-approves a review.
 *
 * The two columns are written together because migration 0016's `reviews_approval_shape`
 * constraint requires it: an approved row must carry `approved_at`, and a pending row must not.
 * Setting one without the other is rejected by the database, which is the point — the console
 * cannot leave a row in a half-moderated state.
 */
export async function setReviewApproval(id: string, approve: boolean): Promise<void> {
  if (isDemoMode()) throw new Error(DEMO_MESSAGE);

  const supabase = db();

  let approvedBy: string | null = null;
  if (approve) {
    const { data } = await supabase.auth.getUser();
    approvedBy = data.user?.id ?? null;
  }

  const { error } = await supabase
    .from('reviews')
    .update({
      is_approved: approve,
      approved_at: approve ? new Date().toISOString() : null,
      approved_by: approve ? approvedBy : null,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Deletes a review outright. RLS restricts this to admins. */
export async function deleteReview(id: string): Promise<void> {
  if (isDemoMode()) throw new Error(DEMO_MESSAGE);

  const { error } = await db().from('reviews').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
