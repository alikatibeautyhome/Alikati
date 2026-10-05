'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import {
  confirmTotpEnrolment,
  getMfaStatus,
  removeTotpFactor,
  startTotpEnrolment,
  type EnrolmentStart,
  type MfaStatus,
} from '@/lib/security/mfa';

/**
 * Defence in depth for the QR image.
 *
 * The SVG comes from Supabase's own auth server over TLS, so it is trusted in practice. It is still
 * markup being injected into the page with `dangerouslySetInnerHTML`, and the rule for that is to
 * never let the value carry script regardless of where it came from — a dependency, a proxy or a
 * future API change should not be able to turn a QR code into an execution path. Stripping the two
 * script vectors costs nothing and closes the assumption.
 */
function safeQrSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Two-factor authentication, from the account owner's side.
 *
 * One card in three states: off, mid-setup, on. Deliberately explicit that turning it on is
 * optional and turning it *off* is a step down — a security control nobody understands is a control
 * nobody uses.
 */
export function MfaSettingsCard() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrolment, setEnrolment] = useState<EnrolmentStart | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refresh = useCallback(() => {
    getMfaStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function start() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await startTotpEnrolment();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrolment(result.data);
    setCode('');
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrolment) return;
    setBusy(true);
    setError(null);
    const result = await confirmTotpEnrolment(enrolment.factorId, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrolment(null);
    setCode('');
    setNotice('Two-factor authentication is on. You will be asked for a code at your next sign-in.');
    refresh();
  }

  async function turnOff() {
    if (!status?.factorId) return;
    setBusy(true);
    setError(null);
    const result = await removeTotpFactor(status.factorId);
    setBusy(false);
    setConfirmRemove(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice('Two-factor authentication is off. Sign-in is by password only again.');
    refresh();
  }

  async function copySecret() {
    if (!enrolment) return;
    try {
      await navigator.clipboard.writeText(enrolment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the secret is visible on screen either way.
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Two-factor authentication
            </CardTitle>
            <CardDescription>
              A 6-digit code from an authenticator app, on top of your password. Strongly recommended
              — this console can see every customer&rsquo;s name, phone number and address.
            </CardDescription>
          </div>

          {status === null ? null : status.enrolled ? (
            <Badge className="bg-success/10 text-success ring-success/25">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
              On
            </Badge>
          ) : (
            <Badge>
              <ShieldOff className="mr-1 h-3 w-3" aria-hidden="true" />
              Off
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {notice}
          </p>
        )}

        {/* ── State: off ───────────────────────────────────────────────────── */}
        {!status?.enrolled && !enrolment && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={start} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Turn on two-factor authentication
            </Button>
            <p className="text-xs text-charcoal-soft">
              You will need an authenticator app such as Google Authenticator, Authy or 1Password.
            </p>
          </div>
        )}

        {/* ── State: mid-setup ─────────────────────────────────────────────── */}
        {enrolment && (
          <div className="space-y-4 rounded-xl border border-charcoal/10 bg-white/70 p-4">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <div
                className="h-40 w-40 shrink-0 rounded-xl border border-charcoal/10 bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
                // The SVG is Supabase's, sanitised immediately above.
                dangerouslySetInnerHTML={{ __html: safeQrSvg(enrolment.qrCode) }}
              />

              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-charcoal">1. Scan this code</p>
                <p className="text-xs text-charcoal-soft">
                  Open your authenticator app and scan the square. If you cannot scan it, type this
                  key in instead:
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-blush-100 px-3 py-2 font-mono text-xs text-charcoal">
                    {enrolment.secret}
                  </code>
                  <Button type="button" variant="secondary" size="sm" onClick={copySecret}>
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            <form onSubmit={confirm} className="space-y-3 border-t border-charcoal/10 pt-4">
              <Field
                label="2. Enter the 6-digit code it shows"
                htmlFor="mfa-code"
                hint="This proves the app is set up before we switch it on."
              >
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  // `one-time-code` lets a phone offer the code straight from the notification.
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="max-w-[10rem] font-mono tracking-widest"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Verify and turn on
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEnrolment(null);
                    setCode('');
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── State: on ────────────────────────────────────────────────────── */}
        {status?.enrolled && !enrolment && (
          <div className="space-y-3">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <dt className="text-charcoal-soft">Enrolled</dt>
              <dd className="text-charcoal">{status.friendlyName ?? 'Authenticator app'}</dd>
              <dt className="text-charcoal-soft">This session</dt>
              <dd className="text-charcoal">
                {status.currentLevel === 'aal2'
                  ? 'Verified with a code'
                  : 'Password only — a code is required to continue'}
              </dd>
            </dl>

            {confirmRemove ? (
              <div className="space-y-3 rounded-xl bg-warn/10 p-3">
                <p className="text-sm text-charcoal">
                  Turning this off leaves your account protected by a password alone. Anyone who
                  learns it gets full access to customer records.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" onClick={turnOff} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Yes, turn it off
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmRemove(false)} disabled={busy}>
                    Keep it on
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setConfirmRemove(true)}>
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
                Turn off two-factor authentication
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
