'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { applyAsAffiliate, suggestAffiliateCode } from '@/lib/marketing-api';
import { SOCIAL_FIELDS, hasAnySocial, normalizeSocialAccounts, socialProfileLinks } from '@/lib/socials';
import { formatPhoneDisplay, isValidNepaliPhone } from '@/lib/utils';
import type { Affiliate } from '@/types/marketing.types';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Public affiliate application form.
 *
 * Applications are inserted as `pending` — the salon reviews them and activates the code. The
 * preferred-code suggestion is generated in the browser (it is random), so it is only ever set
 * from an event handler, never during render.
 *
 * Social accounts are part of the application because they are what the salon actually reviews:
 * migration 0017 refuses an application that supplies none. The three inputs are rendered from
 * `SOCIAL_FIELDS` so this form and the admin edit modal cannot drift apart.
 */
export function AffiliateJoinForm() {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [preferredCode, setPreferredCode] = React.useState('');
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [socials, setSocials] = React.useState({
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState<Affiliate | null>(null);

  function suggestCode() {
    setPreferredCode(suggestAffiliateCode(name));
    setCodeTouched(true);
  }

  function handleNameBlur() {
    if (codeTouched || preferredCode.trim() || name.trim().length < 2) return;
    setPreferredCode(suggestAffiliateCode(name));
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (name.trim().length < 2) found.name = 'Please enter your full name.';
    if (!isValidNepaliPhone(phone)) found.phone = 'Enter a valid 10-digit Nepali mobile number.';
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      found.email = 'Enter a valid email address, or leave it blank.';
    }

    // Each filled-in account must be usable once normalised — an empty box is simply "not
    // provided", but a box with unparseable text in it is an error worth surfacing.
    for (const field of SOCIAL_FIELDS) {
      const raw = socials[field.key].trim();
      if (!raw) continue;
      const normalized = field.normalize(raw);
      if (!normalized || !field.isValid(normalized)) found[field.key] = field.invalidMessage;
    }

    if (!hasAnySocial(normalizeSocialAccounts(socials))) {
      found.socials = 'Add at least one account so the salon can review your application.';
    }

    return found;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Please check the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await applyAsAffiliate({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        preferred_code: preferredCode.trim() || null,
        ...normalizeSocialAccounts(socials),
      });
      setSubmitted(created);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'We could not submit your application. Please try again in a moment.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="space-y-4 p-5 sm:p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>

        <div className="space-y-1">
          <h2 className="font-display text-xl text-charcoal">Application received</h2>
          <p className="text-sm text-charcoal-soft">
            धन्यवाद, {submitted.name}. Your application is with the salon for review — we will
            message you on {formatPhoneDisplay(submitted.phone)} as soon as your code is live.
          </p>
        </div>

        <dl className="space-y-2 rounded-xl bg-blush-50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal-soft">Your code (once approved)</dt>
            <dd className="min-w-0 break-words text-right font-medium text-charcoal">
              {submitted.code}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal-soft">Status</dt>
            <dd className="shrink-0 font-medium text-warn">Pending review</dd>
          </div>
          {socialProfileLinks(submitted).length > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-charcoal-soft">Sent for review</dt>
              <dd className="min-w-0 break-words text-right text-charcoal">
                {socialProfileLinks(submitted)
                  .map((link) => link.label)
                  .join(', ')}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="text-xs text-charcoal-soft">
          Applications are reviewed by the salon, and you will be told when your code is live. Referrals
          are tracked in your browser for 60 days — see{' '}
          <Link href="/privacy" className="text-rose-gold underline underline-offset-2">
            Privacy &amp; cookies
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="font-display text-xl text-charcoal">Apply to join</h2>
        <p className="text-sm text-charcoal-soft">
          Tell us how to reach you, and where you post. Applications are reviewed by the salon
          before a code goes live.
        </p>
      </div>

      {formError ? (
        <p role="alert" className="rounded-xl bg-danger/5 p-3 text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Full name" htmlFor="affiliate-name" error={errors.name}>
          <Input
            id="affiliate-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleNameBlur}
            autoComplete="name"
            placeholder="e.g. Nirmala Khadka"
            aria-invalid={Boolean(errors.name)}
            required
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="affiliate-phone"
          hint="10-digit Nepali mobile, e.g. 9800000000"
          error={errors.phone}
        >
          <Input
            id="affiliate-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="98XXXXXXXX"
            aria-invalid={Boolean(errors.phone)}
            required
          />
        </Field>

        <Field label="Email (optional)" htmlFor="affiliate-email" error={errors.email}>
          <Input
            id="affiliate-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>

        <fieldset className="space-y-4 rounded-xl border border-charcoal/10 bg-blush-50/70 p-4">
          <legend className="px-1 text-sm font-medium text-charcoal">Your social accounts</legend>
          <p className="-mt-2 text-xs text-charcoal-soft">
            At least one, so the salon can see where you post. A username is enough — paste a
            profile link if that is easier.
          </p>

          {errors.socials ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.socials}
            </p>
          ) : null}

          {SOCIAL_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`affiliate-${field.key}`}
              hint={field.hint}
              error={errors[field.key]}
            >
              <Input
                id={`affiliate-${field.key}`}
                value={socials[field.key]}
                onChange={(event) =>
                  setSocials((current) => ({ ...current, [field.key]: event.target.value }))
                }
                placeholder={field.placeholder}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors[field.key])}
              />
            </Field>
          ))}
        </fieldset>

        <Field
          label="Preferred code (optional)"
          htmlFor="affiliate-code"
          hint="Your link will look like /?ref=YOUR-CODE. Leave blank and we will suggest one."
        >
          <div className="flex gap-2">
            <Input
              id="affiliate-code"
              value={preferredCode}
              onChange={(event) => {
                setCodeTouched(true);
                setPreferredCode(event.target.value);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. NIRMALA-K7"
              className="min-w-0 flex-1 uppercase"
            />
            <Button
              type="button"
              variant="outline"
              onClick={suggestCode}
              className="min-h-11 shrink-0 dark:bg-white/10"
              aria-label="Suggest a code based on my name"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Suggest
            </Button>
          </div>
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Sending application…' : 'Apply to join'}
        </Button>

        <p className="text-xs text-charcoal-soft">
          How referrals are tracked is explained on our{' '}
          <Link href="/privacy" className="text-rose-gold underline underline-offset-2">
            Privacy &amp; cookies
          </Link>{' '}
          page.
        </p>
      </form>
    </Card>
  );
}
