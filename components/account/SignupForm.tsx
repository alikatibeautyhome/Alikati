'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { signUpCustomer } from '@/lib/customer-api';
import { isValidNepaliPhone } from '@/lib/utils';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

/**
 * Customer sign-up. Creating an account is entirely optional — the shop, cart and checkout all
 * work without one, and this form links back to guest browsing.
 */
export function SignupForm() {
  const router = useRouter();

  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [marketing, setMarketing] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [checkEmail, setCheckEmail] = React.useState(false);

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) {
      errors.full_name = 'Please enter your full name.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!isValidNepaliPhone(phone)) {
      errors.phone = 'Enter a valid 10-digit Nepali mobile number.';
    }
    if (password.length < MIN_PASSWORD) {
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    }
    if (confirm !== password) {
      errors.confirm = 'The two passwords do not match.';
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please check the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUpCustomer({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        marketing_opt_in: marketing,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (result.needsEmailConfirmation) {
        setCheckEmail(true);
        return;
      }

      router.push('/account');
    } catch {
      setFormError('We could not create your account. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="space-y-4 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-gold">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl text-charcoal">Check your email</h1>
          <p className="text-sm text-charcoal-soft">
            We sent a confirmation link to <span className="font-medium text-charcoal">{email.trim()}</span>.
            Open it to activate your account, then sign in.
          </p>
          <Link href="/account/login" className="text-sm font-medium text-rose-gold hover:underline">
            Go to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <p className="eyebrow">Alikati Beauty Home</p>
        <h1 className="mt-1 font-display text-3xl text-charcoal">Create your account</h1>
        <p className="mt-1 text-sm text-charcoal-soft">
          Optional — an account just saves your details and keeps your orders in one place.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="gradient-rose px-6 py-4">
          <p className="font-display text-lg text-white">Sign up</p>
        </div>

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Full name" htmlFor="signup-name" error={fieldErrors.full_name}>
              <Input
                id="signup-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                placeholder="e.g. Sita Joshi"
                aria-invalid={Boolean(fieldErrors.full_name)}
                required
              />
            </Field>

            <Field label="Email" htmlFor="signup-email" error={fieldErrors.email}>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                required
              />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="signup-phone"
              hint="10-digit Nepali mobile, e.g. 9800000000"
              error={fieldErrors.phone}
            >
              <Input
                id="signup-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="98XXXXXXXX"
                aria-invalid={Boolean(fieldErrors.phone)}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" htmlFor="signup-password" error={fieldErrors.password}>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  minLength={MIN_PASSWORD}
                  aria-invalid={Boolean(fieldErrors.password)}
                  required
                />
              </Field>

              <Field label="Confirm password" htmlFor="signup-confirm" error={fieldErrors.confirm}>
                <Input
                  id="signup-confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  minLength={MIN_PASSWORD}
                  aria-invalid={Boolean(fieldErrors.confirm)}
                  required
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-charcoal-soft">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-rose-gold"
              />
              Send me occasional offers on WhatsApp or email.
            </label>

            {formError ? (
              <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                {formError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" loading={submitting}>
              Create account
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-charcoal-soft">
            Already have an account?{' '}
            <Link href="/account/login" className="font-medium text-rose-gold hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-charcoal-soft">
            No account needed —{' '}
            <Link href="/shop" className="text-rose-gold hover:underline">
              keep browsing as a guest
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
