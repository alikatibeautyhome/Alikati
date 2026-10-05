'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';

/**
 * Two-factor authentication for the staff console, on Supabase's built-in TOTP support.
 *
 * ── Why this, and why here ───────────────────────────────────────────────────
 * The admin console holds the most sensitive data the shop has: every customer's name, phone
 * number and delivery address, plus the ability to change orders and prices. A stolen password was
 * therefore enough to reach all of it. A password is one secret that gets reused, phished,
 * shoulder-surfed and leaked from unrelated breaches; a second factor is a different kind of secret
 * that does not travel with it.
 *
 * ── How Supabase models it ───────────────────────────────────────────────────
 * Enrolling adds a *factor* to the account. Once a verified factor exists, a password-only session
 * is only **aal1** (authenticator assurance level 1), and Supabase reports `nextLevel` as `aal2` —
 * meaning a second factor is available and expected. Completing a TOTP challenge upgrades the
 * session itself to aal2. That distinction is the whole enforcement mechanism: the console asks
 * whether `currentLevel` has reached `nextLevel`, rather than keeping its own flag, so a session
 * cannot be talked into looking verified.
 *
 * ── Deliberately not enforced at enrolment ───────────────────────────────────
 * Staff are never forced to enrol. Turning 2FA on is a decision for the owner, and forcing it at
 * deploy time would lock every existing account out of the console the moment this shipped. What is
 * enforced is that *once enrolled, the second factor is required* — the per-account opt-in cannot be
 * bypassed afterwards. Requiring it for everybody is a policy switch (`requireMfaForAll`), not a
 * code change.
 */

/**
 * Write an entry to the security log from the browser.
 *
 * Uses the `log_security_event` database function rather than inserting directly, because that
 * function takes the actor **from the session**. A browser can say what happened; it cannot say who
 * did it, so it cannot forge an entry naming another account. Best-effort on purpose — failing to
 * log must never turn a successful security action into an error the operator sees.
 */
async function logSecurityEvent(
  action: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (isDemoMode()) return;
  try {
    await getSupabaseBrowserClient().rpc('log_security_event', {
      p_action: action,
      p_summary: summary,
      p_entity: 'profiles',
      p_entity_id: null,
      p_metadata: metadata,
    });
  } catch {
    // The action itself already succeeded; the log is secondary.
  }
}

export interface MfaStatus {
  /** True when the account has at least one verified TOTP factor. */
  enrolled: boolean;
  /** The verified factor's id, needed to challenge or remove it. */
  factorId: string | null;
  /** 'aal1' or 'aal2' — what this session has proved so far. */
  currentLevel: string | null;
  /** 'aal1' or 'aal2' — what is required. 'aal2' once a factor is enrolled. */
  nextLevel: string | null;
  /**
   * True when a second factor exists but this session has not satisfied it yet. The console must
   * send the user to the challenge step rather than letting them in.
   */
  challengeRequired: boolean;
  /** Human label given at enrolment, shown in the console. */
  friendlyName: string | null;
}

const UNKNOWN: MfaStatus = {
  enrolled: false,
  factorId: null,
  currentLevel: null,
  nextLevel: null,
  challengeRequired: false,
  friendlyName: null,
};

/**
 * Read the account's factor state and what this session has proved.
 *
 * Demo mode has no auth server, so it reports "nothing enrolled, nothing required" — which keeps
 * the demo console usable rather than blocking it behind a factor that cannot exist.
 */
export async function getMfaStatus(): Promise<MfaStatus> {
  if (isDemoMode()) return UNKNOWN;

  const supabase = getSupabaseBrowserClient();
  const [factors, level] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const verified = (factors.data?.totp ?? []).find((f) => f.status === 'verified') ?? null;
  const currentLevel = level.data?.currentLevel ?? null;
  const nextLevel = level.data?.nextLevel ?? null;

  return {
    enrolled: Boolean(verified),
    factorId: verified?.id ?? null,
    currentLevel,
    nextLevel,
    // Only ever true when a factor genuinely exists and has not been satisfied.
    challengeRequired: Boolean(verified) && currentLevel !== 'aal2' && nextLevel === 'aal2',
    friendlyName: verified?.friendly_name ?? null,
  };
}

export interface EnrolmentStart {
  factorId: string;
  /** SVG QR code, ready to inject into the page. */
  qrCode: string;
  /** The same secret in text form, for anyone typing it in by hand. */
  secret: string;
}

/**
 * Begin enrolling a TOTP factor.
 *
 * This only *creates* the factor — it is unverified and confers nothing until a code from the
 * authenticator app is checked via `confirmTotpEnrolment`. That two-step shape is deliberate: a
 * half-enrolled factor must never be treated as protection.
 */
export async function startTotpEnrolment(): Promise<
  { ok: true; data: EnrolmentStart } | { ok: false; error: string }
> {
  if (isDemoMode()) {
    return { ok: false, error: 'Two-factor authentication is unavailable in demo mode.' };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Alikati admin — ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) {
    // Generic wording: the raw message can name internal auth endpoints (see §5 of the checklist).
    return { ok: false, error: 'Could not start setup. Please try again.' };
  }

  return {
    ok: true,
    data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/**
 * Prove the factor works, which is what makes it count.
 *
 * `challengeAndVerify` creates and consumes the challenge in one round trip. On success the current
 * session is upgraded to aal2, so the user is not immediately asked for the code again.
 */
export async function confirmTotpEnrolment(
  factorId: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: false, error: 'Two-factor authentication is unavailable in demo mode.' };

  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) return { ok: false, error: 'Enter the 6-digit code from your app.' };

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });

  if (error) {
    // A wrong or expired code is the overwhelmingly likely cause, and the real message says
    // "Invalid TOTP code entered" — which is fine to surface, unlike an infrastructure error.
    const isCodeProblem = /invalid|expired|totp|code/i.test(error.message);
    return {
      ok: false,
      error: isCodeProblem
        ? 'That code was not accepted. Check your authenticator app and try the current one.'
        : 'Could not verify the code. Please try again.',
    };
  }

  await logSecurityEvent('mfa.enrolled', 'Turned on two-factor authentication');
  return { ok: true };
}

/** Satisfy the second factor for an existing session (the login step). */
export async function challengeTotp(
  factorId: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return confirmTotpEnrolment(factorId, code);
}

/**
 * Remove the factor.
 *
 * Worth being honest about in the UI: removing it returns the account to password-only, so it is
 * a step down in security, not a neutral action.
 */
export async function removeTotpFactor(
  factorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: false, error: 'Two-factor authentication is unavailable in demo mode.' };

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: 'Could not turn off two-factor authentication.' };
  // Turning a security control OFF is at least as worth recording as turning it on.
  await logSecurityEvent('mfa.disabled', 'Turned off two-factor authentication');
  return { ok: true };
}
