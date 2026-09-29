'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { signInStaff } from '@/lib/api-client';
import { DEMO_CREDENTIALS, isDemoMode } from '@/lib/supabase/config';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';
  const demo = isDemoMode();

  const [email, setEmail] = useState(demo ? DEMO_CREDENTIALS.email : '');
  const [password, setPassword] = useState(demo ? DEMO_CREDENTIALS.password : '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signInStaff(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gradient-warm flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="eyebrow">Alikati Beauty Home</p>
          <h1 className="mt-1 font-display text-3xl text-charcoal">Admin console</h1>
          <p className="mt-1 text-sm text-charcoal-soft">
            Sign in to manage bookings, services and academy leads.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="gradient-rose px-6 py-4">
            <p className="font-display text-lg text-white">Staff sign in</p>
          </div>

          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email" htmlFor="login-email">
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  // Only advertise the demo address while there is no database behind the form.
                  placeholder={demo ? DEMO_CREDENTIALS.email : 'you@example.com'}
                  required
                />
              </Field>

              <Field label="Password" htmlFor="login-password">
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
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
                  Supabase is not configured, so the console runs on bundled seed data. Use these
                  credentials:
                </p>
                <p className="mt-1 font-mono text-charcoal">
                  {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-center text-xs text-charcoal-soft">
              <Link href="/" className="text-rose-gold hover:underline">
                Back to the public site
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="gradient-warm flex min-h-screen items-center justify-center text-sm text-charcoal-soft">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
