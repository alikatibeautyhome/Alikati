'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Star, Trash2, Undo2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  deleteReview,
  getReviews,
  setReviewApproval,
  type ReviewFilter,
} from '@/lib/reviews-admin-api';
import { cn, formatDateLong, todayISO } from '@/lib/utils';
import type { Review } from '@/types/reviews.types';

const FILTERS: ReviewFilter[] = ['pending', 'approved', 'all'];

const FILTER_LABELS: Record<ReviewFilter, string> = {
  pending: 'Waiting',
  approved: 'Published',
  all: 'All',
};

/** Filled/empty stars for a submitted rating. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'h-4 w-4',
            star <= rating ? 'fill-gold text-gold' : 'fill-none text-charcoal/25'
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ReviewRow({ review, onChanged }: { review: Review; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'unapprove' | 'delete') {
    if (busy) return;

    if (action === 'delete' && !window.confirm('Delete this review permanently?')) return;

    setBusy(true);
    setError(null);
    try {
      if (action === 'delete') await deleteReview(review.id);
      else await setReviewApproval(review.id, action === 'approve');
      onChanged();
    } catch (err) {
      // Surface the database's own message: it names the cause far better than a generic string.
      setError(err instanceof Error ? err.message : 'Could not update this review.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-charcoal">{review.author_name}</p>
            {review.is_approved ? (
              <StatusBadge className="bg-success/15 text-success">Published</StatusBadge>
            ) : (
              <StatusBadge className="bg-gold/20 text-charcoal">Waiting for approval</StatusBadge>
            )}
            {review.source === 'imported' ? (
              <StatusBadge className="bg-blush-200 text-charcoal">Imported</StatusBadge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars rating={review.rating} />
            {review.service_label ? (
              <span className="text-sm text-charcoal-soft">{review.service_label}</span>
            ) : null}
          </div>

          <p className="text-xs text-charcoal-soft">
            Submitted {formatDateLong(todayISO(new Date(review.created_at)))}
            {review.approved_at
              ? ` · published ${formatDateLong(todayISO(new Date(review.approved_at)))}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {review.is_approved ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void act('unapprove')}
              aria-label={`Hide the review from ${review.author_name}`}
              className="h-10 sm:h-8"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
              Un-publish
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void act('approve')}
              aria-label={`Publish the review from ${review.author_name}`}
              className="h-10 sm:h-8"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              Approve
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void act('delete')}
            aria-label={`Delete the review from ${review.author_name}`}
            className="h-10 text-danger hover:bg-danger/10 sm:h-8"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      <p className="mt-3 break-words whitespace-pre-line rounded-lg bg-cream-100 p-3 text-sm text-charcoal">
        {review.body}
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReviews(await getReviews('all'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reviews.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const counts: Record<ReviewFilter, number> = {
    all: reviews.length,
    pending: 0,
    approved: 0,
  };
  for (const review of reviews) {
    if (review.is_approved) counts.approved += 1;
    else counts.pending += 1;
  }

  const visible = (
    filter === 'all'
      ? reviews
      : reviews.filter((review) => (filter === 'approved' ? review.is_approved : !review.is_approved))
  )
    .slice()
    // Work the queue oldest-first; published reviews read newest-first.
    .sort((a, b) =>
      filter === 'pending'
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at)
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Customer feedback</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Reviews</h1>
        <p className="text-sm text-charcoal-soft">
          Nothing appears on the site until you approve it. Approving publishes the review to the
          landing-page carousel immediately.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>
              {counts.pending > 0
                ? `${counts.pending} review${counts.pending === 1 ? '' : 's'} waiting`
                : 'Nothing waiting'}
            </CardTitle>
            <CardDescription>
              {visible.length} shown of {reviews.length} total
            </CardDescription>
          </div>

          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-rose-gold bg-rose-gold text-white'
                      : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
                  )}
                >
                  {FILTER_LABELS[key]}
                  <span className="rounded-full bg-charcoal/10 px-1.5 text-[10px] font-semibold text-charcoal">
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse-soft rounded-2xl bg-charcoal/5" />
            ))
          ) : reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">No reviews yet.</p>
              <p className="mt-1 text-sm text-charcoal-soft">
                Reviews submitted from the landing page will land here for approval.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-8 text-center text-sm text-charcoal-soft">
              {filter === 'pending'
                ? 'Nothing waiting for approval.'
                : `No ${FILTER_LABELS[filter].toLowerCase()} reviews.`}
            </div>
          ) : (
            visible.map((review) => (
              <ReviewRow key={review.id} review={review} onChanged={() => void load()} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
