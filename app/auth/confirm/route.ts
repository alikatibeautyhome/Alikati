import { type NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Where the email confirmation link lands. This route did not exist, which is why confirming an
 * address did not work.
 *
 * ── Why it is needed ─────────────────────────────────────────────────────────
 * The app signs users in through `@supabase/ssr`, which uses the PKCE flow. In that flow the link
 * in the email does not hand back a session: Supabase verifies the token and redirects here with a
 * short-lived `code`, which the application must exchange for a session before the browser can hold
 * one. Nothing was performing that exchange — `exchangeCodeForSession` and `verifyOtp` appeared
 * nowhere in the codebase — so a visitor who clicked the link arrived on the homepage, still signed
 * out, with the code sitting unused in the URL.
 *
 * ── Two shapes of link are accepted ──────────────────────────────────────────
 * `code` is what the default `{{ .ConfirmationURL }}` template produces. `token_hash` + `type` is
 * what a template using `{{ .TokenHash }}` produces, which is the form Supabase recommends for
 * server-side verification because the token is verified here rather than by the browser. Supporting
 * both means the email template can be changed later without breaking links already in inboxes.
 */
export const dynamic = 'force-dynamic';

/** Only ever redirect within this site — a `next` value of `https://evil.example` is discarded. */
function safeNext(value: string | null): string {
  if (!value) return '/account';
  // A leading `//` is protocol-relative and an absolute URL in disguise, so reject it too.
  if (!value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  // Supabase can also send us here with a reason the link failed, e.g. an expired OTP.
  const upstreamError = searchParams.get('error_code') ?? searchParams.get('error');

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}?confirmed=1`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}?confirmed=1`);
  }

  /*
    Two distinct failures, and they need different words. `otp_expired` is the common and benign one
    — links last an hour (`mailer_otp_exp`) and inboxes are not read instantly. Anything else is a
    link that has already been used, or was tampered with.
  */
  const notice = upstreamError === 'otp_expired' ? 'link-expired' : 'link-invalid';
  return NextResponse.redirect(`${origin}/account/login?notice=${notice}`);
}
