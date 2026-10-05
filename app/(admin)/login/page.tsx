'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { signInStaff } from '@/lib/api-client';
import { challengeTotp, getMfaStatus } from '@/lib/security/mfa';
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
  /*
    Set once the password has been accepted but a second factor is still outstanding. Holding the
    factor id here (rather than a boolean) means the challenge step cannot be reached without a
    factor that actually exists on the account.
  */
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

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

      /*
        A correct password is no longer the end of sign-in. If the account has a verified
        authenticator factor this session is only aal1 and must be upgraded before the console
        opens — otherwise 2FA would be advisory rather than enforced.
      */
      const status = await getMfaStatus();
      if (status.challengeRequired && status.factorId) {
        setMfaFactorId(status.factorId);
        setMfaCode('');
        return;
      }

      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaFactorId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await challengeTotp(mfaFactorId, mfaCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The session is aal2 now, so the console guard will let it through.
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
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

            {mfaFactorId ? (
              <form onSubmit={handleMfaSubmit} className="mt-5 space-y-4 border-t border-charcoal/10 pt-5">
                <Field
                  label="Authentication code"
                  htmlFor="login-mfa-code"
                  hint="The 6-digit code from your authenticator app."
                >
                  <Input
                    id="login-mfa-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    className="max-w-[10rem] font-mono tracking-widest"
                    autoFocus
                  />
                </Field>

                {error ? (
                  <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={loading}>
                    Verify and continue
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMfaFactorId(null);
                      setMfaCode('');
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

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
