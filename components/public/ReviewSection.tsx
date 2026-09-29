'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ReviewCarousel } from '@/components/public/ReviewCarousel';
import { isDemoMode } from '@/lib/supabase/config';
import { cn } from '@/lib/utils';
import type { PublicReview, ReviewSubmitResult } from '@/types/reviews.types';

const MAX_BODY = 1200;

/**
 * The landing page's "In their words" section.
 *
 * Shows only approved reviews, and lets a visitor submit one that is then held for moderation.
 * Two rules shape the whole component:
 *
 *   • Nothing is displayed that a customer did not write. With no approved reviews this renders
 *     an invitation, not sample quotes — the previous hardcoded six were removed for that reason.
 *   • The summary line is arithmetic over the reviews actually shown, so it can never claim a
 *     rating the salon did not earn.
 */
export function ReviewSection({ reviews }: { reviews: PublicReview[] }) {
  const demo = isDemoMode();

  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');

  // ── Demo mode: there is no moderation queue and nowhere to store a submission. ────────────
  if (demo) {
    return (
      <p className="mx-auto max-w-2xl text-center text-sm text-charcoal-soft">
        Client reviews will appear here once the shop is connected to its database. Reviews are
        held for approval before they are shown, so this section stays empty until then.
      </p>
    );
  }

  const average =
    reviews.length > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: name,
          service_label: service,
          rating,
          body: text,
        }),
      });

      const result = (await response.json()) as ReviewSubmitResult;

      if (!response.ok || !result.ok) {
        // Surface the API's own wording rather than a generic message.
        setError(result.error ?? 'We could not save your review. Please try again.');
        setFieldErrors(result.fields ?? {});
        return;
      }

      setSent(true);
      setOpen(false);
      setName('');
      setService('');
      setText('');
      setRating(5);
    } catch {
      setError('You appear to be offline. Please try again when you reconnect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {reviews.length > 0 ? (
        <>
          <p className="text-center text-sm text-charcoal-soft">
            <span className="font-medium text-charcoal">
              {average.toFixed(1)} out of 5
            </span>{' '}
            from {reviews.length} approved customer {reviews.length === 1 ? 'review' : 'reviews'}
          </p>
          <ReviewCarousel reviews={reviews} />
        </>
      ) : (
        <p className="mx-auto max-w-2xl text-center text-sm text-charcoal-soft">
          No reviews have been published yet. If you have visited us, yours would be the first.
        </p>
      )}

      {sent ? (
        <p
          role="status"
          className="mx-auto flex max-w-2xl items-start gap-2 rounded-xl bg-blush-100 px-4 py-3 text-sm text-charcoal"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
          <span>
            Thank you — your review has been sent to the salon. It will appear here once someone has
            checked it.
          </span>
        </p>
      ) : null}

      <div className="text-center">
        <Button
          type="button"
          variant={open ? 'outline' : 'default'}
          onClick={() => {
            setOpen((wasOpen) => !wasOpen);
            setError(null);
          }}
          aria-expanded={open}
          className="min-h-11 w-full sm:w-auto"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          {open ? 'Cancel' : 'Write a review'}
        </Button>
      </div>

      {open ? (
        <form onSubmit={submit} className="panel mx-auto max-w-2xl space-y-5 p-5 sm:p-7">
          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <Field label="Your name" htmlFor="review-name" error={fieldErrors.author_name}>
            <Input
              id="review-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="name"
              required
            />
          </Field>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-charcoal">Your rating</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  onClick={() => setRating(value)}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-blush-100"
                >
                  <Star
                    className={cn(
                      'h-6 w-6',
                      value <= rating ? 'fill-gold text-gold' : 'fill-none text-charcoal/30'
                    )}
                    aria-hidden="true"
                  />
                </button>
              ))}
              <span className="ml-1 text-sm text-charcoal-soft">{rating} of 5</span>
            </div>
            {fieldErrors.rating ? (
              <p className="text-xs font-medium text-danger">{fieldErrors.rating}</p>
            ) : null}
          </div>

          <Field
            label="What did you come in for?"
            htmlFor="review-service"
            hint="Optional — for example “Bridal package” or “Gold facial”."
            error={fieldErrors.service_label}
          >
            <Input
              id="review-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
              maxLength={80}
            />
          </Field>

          <Field
            label="Your review"
            htmlFor="review-body"
            hint={`${text.length} of ${MAX_BODY} characters.`}
            error={fieldErrors.body}
          >
            <Textarea
              id="review-body"
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_BODY))}
              required
            />
          </Field>

          <p className="text-xs text-charcoal-soft">
            Reviews are checked by the salon before they appear, so yours will not be visible
            straight away.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="min-h-11 w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy} className="min-h-11 w-full sm:w-auto">
              Send review
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
