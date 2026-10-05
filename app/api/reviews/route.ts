import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import type { ReviewSubmitResult } from '@/types/reviews.types';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * A review is held for moderation, so the abuse this guards against is flooding the owner's
 * approval queue rather than anything reaching the public page — which is why it is tighter than
 * ordering.
 */
const rateLimited = createRateLimiter({
  bucket: 'reviews',
  limit: Number(process.env.REVIEW_RATE_LIMIT_PER_MIN ?? 3),
});

/**
 * Accepts a customer review.
 *
 * The row is inserted through the **publishable** client on purpose: the `reviews_public_insert`
 * policy (migration 0016) is what forces `is_approved = false`, forbids a caller from stamping
 * `approved_at` or `approved_by`, and pins `source` to `'website'`. Doing this with the service
 * key would bypass exactly the guarantee that makes moderation trustworthy.
 *
 * Note there is no `.select()` on the insert. PostgREST implements a returning insert as
 * `INSERT … RETURNING`, and the public read policy only exposes approved rows — so asking for the
 * new row back would fail RLS on a row that was inserted perfectly well. The caller does not need
 * the id; it only needs to know the review was accepted.
 */
export async function POST(request: NextRequest) {
  if (await rateLimited(clientIp(request))) {
    return NextResponse.json<ReviewSubmitResult>(
      { ok: false, error: 'Too many reviews from this connection. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json<ReviewSubmitResult>(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const author_name = String(body.author_name ?? '').trim();
  const service_label = String(body.service_label ?? '').trim();
  const ratingRaw = Number(body.rating);
  const bodyText = String(body.body ?? '').trim();

  /* -------------------------------------------------------------- validation */
  const fields: Record<string, string> = {};

  if (author_name.length < 2 || author_name.length > 80) {
    fields.author_name = 'Please enter your name (2–80 characters).';
  }
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    fields.rating = 'Choose a rating from 1 to 5 stars.';
  }
  if (bodyText.length < 10 || bodyText.length > 1200) {
    fields.body = 'Please write between 10 and 1200 characters.';
  }
  if (service_label.length > 80) {
    fields.service_label = 'Keep this under 80 characters.';
  }

  if (Object.keys(fields).length > 0) {
    return NextResponse.json<ReviewSubmitResult>(
      { ok: false, error: 'Please fix the highlighted fields.', fields },
      { status: 422 }
    );
  }

  /* ------------------------------------------------------ demo-mode shortcut */
  if (isDemoMode()) {
    return NextResponse.json<ReviewSubmitResult>(
      {
        ok: false,
        error:
          'Reviews are not being saved: this preview is running without a database. Connect Supabase to collect them.',
      },
      { status: 503 }
    );
  }

  /* --------------------------------------------------------- live-mode insert */
  const supabase = await createClient();

  const { error } = await supabase.from('reviews').insert([
    {
      author_name,
      service_label: service_label || null,
      rating: ratingRaw,
      body: bodyText,
      // Sent explicitly even though the policy requires these values — the request should read
      // as an honest statement of what it is asking for, and the policy is the guarantee.
      is_approved: false,
      source: 'website',
    },
  ]);

  if (error) {
    console.error('[api/reviews] insert failed:', error.code, error.message);
    return NextResponse.json<ReviewSubmitResult>(
      { ok: false, error: 'We could not save your review. Please try again in a moment.' },
      { status: 500 }
    );
  }

  return NextResponse.json<ReviewSubmitResult>({ ok: true, pending: true }, { status: 201 });
}
