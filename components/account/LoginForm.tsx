'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { signInCustomer } from '@/lib/customer-api';
import { DEMO_CUSTOMER, isDemoMode } from '@/lib/supabase/config';

/**
 * Only honour a `next` value that is a site-relative path: rejects `//evil.com` and absolute
 * URLs so a crafted link cannot bounce a signed-in customer off-site.
 */
function safeNext(next: string | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/account';
}

/** Customer sign-in. Signing in is optional — guests can keep shopping and checking out. */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const demo = isDemoMode();
  const destination = safeNext(next);

  const [email, setEmail] = React.useState(demo ? DEMO_CUSTOMER.email : '');
  const [password, setPassword] = React.useState(demo ? DEMO_CUSTOMER.password : '');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await signInCustomer(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(destination);
    } catch {
      setError('We could not sign you in. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <p className="eyebrow">Alikati Beauty Home</p>
        <h1 className="mt-1 font-display text-3xl text-charcoal">Welcome back</h1>
        <p className="mt-1 text-sm text-charcoal-soft">
          Sign in to see your order history and saved delivery details.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="gradient-rose px-6 py-4">
          <p className="font-display text-lg text-white">Sign in</p>
        </div>

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email" htmlFor="account-login-email">
              <Input
                id="account-login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(error)}
                required
              />
            </Field>

            <Field label="Password" htmlFor="account-login-password">
              <Input
                id="account-login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={Boolean(error)}
                required
              />
            </Field>

            {error ? (
              <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>

          {demo ? (
            <div className="mt-5 rounded-xl border border-rose-gold/25 bg-blush-100 p-3 text-xs text-charcoal">
              <p className="font-semibold uppercase tracking-wide text-rose-gold">Demo mode</p>
              <p className="mt-1">
                Supabase is not configured, so the account area runs on bundled seed data. Use these
                credentials:
              </p>
              <p className="mt-1 font-mono text-charcoal">
                {DEMO_CUSTOMER.email} / {DEMO_CUSTOMER.password}
              </p>
            </div>
          ) : null}

          <p className="mt-5 text-center text-sm text-charcoal-soft">
            New here?{' '}
            <Link href="/account/signup" className="font-medium text-rose-gold hover:underline">
              Create an account
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-charcoal-soft">
            No account needed —{' '}
            <Link href={next ?? '/shop'} className="text-rose-gold hover:underline">
              continue as a guest
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
