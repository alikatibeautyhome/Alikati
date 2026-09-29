/**
 * Coupons and the affiliate programme.
 *
 * Two audiences share this module:
 *   • the admin console (full CRUD over coupons and affiliates), and
 *   • the public site, which may only *apply* to the programme and *test* a coupon code.
 *
 * In live mode the browser talks to Supabase under RLS — customers never see the coupon table,
 * and an affiliate application can only be inserted as `pending`. In demo mode the same
 * functions read and write the in-memory demo store.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import { normalizeSocialAccounts } from '@/lib/socials';
import type {
  Affiliate,
  AffiliateApplication,
  AffiliatePerformance,
  AffiliateStatus,
  Coupon,
  CouponPreview,
  CouponQuery,
} from '@/types/marketing.types';
import type { Order } from '@/types/commerce.types';

/* ───────────────────────────────────────────────────────────── supabase plumbing */

function db() {
  if (typeof window === 'undefined') {
    throw new Error('marketing-api is browser-only; use the API routes on the server.');
  }
  return getSupabaseBrowserClient();
}

/* ─────────────────────────────────────────────────────────── coupon preview */

/**
 * Asks the server whether a code is usable, and what it would save.
 * Advisory only — `place_order()` recomputes the discount authoritatively.
 */
export async function validateCoupon(code: string, subtotal: number): Promise<CouponPreview> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Enter a code.', code: null, discount_type: null, discount_value: null, discount_npr: 0 };
  }

  try {
    const response = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed, subtotal }),
    });

    if (!response.ok) {
      return {
        valid: false,
        reason: 'We could not check that code. Please try again.',
        code: null,
        discount_type: null,
        discount_value: null,
        discount_npr: 0,
      };
    }

    return (await response.json()) as CouponPreview;
  } catch {
    return {
      valid: false,
      reason: 'You appear to be offline. Check the code again when you reconnect.',
      code: null,
      discount_type: null,
      discount_value: null,
      discount_npr: 0,
    };
  }
}

/* ─────────────────────────────────────────────────────────────────── coupons */

export async function getCoupons(query: CouponQuery = {}): Promise<Coupon[]> {
  if (isDemoMode()) return demoCommerceDb.getCoupons(query);

  const supabase = db();
  let request = supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (query.activeOnly) request = request.eq('is_active', true);
  if (query.search) request = request.ilike('code', `%${query.search}%`);
  if (query.limit) request = request.limit(query.limit);

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as Coupon[];
}

export interface CouponInput {
  id?: string;
  code: string;
  description?: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_npr: number;
  max_discount_npr: number | null;
  usage_limit: number | null;
  per_customer_limit: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
}

export async function upsertCoupon(input: CouponInput): Promise<Coupon> {
  const payload = {
    ...input,
    code: input.code.trim().toUpperCase(),
    // Empty datetime inputs must become NULL, not an invalid timestamp.
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
  };

  if (isDemoMode()) return demoCommerceDb.upsertCoupon(payload);

  const supabase = db();
  const { data, error } = input.id
    ? await supabase.from('coupons').update(payload).eq('id', input.id).select('*').single()
    : await supabase.from('coupons').insert([payload]).select('*').single();

  if (error) throw new Error(error.message);
  return data as Coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  if (isDemoMode()) {
    demoCommerceDb.deleteCoupon(id);
    return;
  }
  const { error } = await db().from('coupons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ──────────────────────────────────────────────────────────────── affiliates */

export async function getAffiliates(): Promise<Affiliate[]> {
  if (isDemoMode()) return demoCommerceDb.getAffiliates();

  const { data, error } = await db()
    .from('affiliates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Affiliate[];
}

/** Derived performance: the order table is the source of truth, not a stored counter. */
export function buildAffiliatePerformance(affiliates: Affiliate[], orders: Order[]): AffiliatePerformance[] {
  return affiliates
    .map((affiliate) => {
      const mine = orders.filter(
        (order) => order.affiliate_code?.toUpperCase() === affiliate.code.toUpperCase()
      );
      const revenue = mine.reduce((sum, order) => sum + Number(order.subtotal_npr), 0);
      const commission = mine.reduce((sum, order) => sum + Number(order.commission_npr ?? 0), 0);

      return {
        affiliate,
        orders: mine.length,
        revenue_npr: revenue,
        commission_npr: commission,
        outstanding_npr: Math.max(0, commission - Number(affiliate.total_paid_npr)),
        last_order_at: mine
          .map((order) => order.created_at)
          .sort()
          .at(-1) ?? null,
      };
    })
    .sort((a, b) => b.commission_npr - a.commission_npr);
}

export interface AffiliateInput {
  id?: string;
  name: string;
  phone: string;
  email?: string | null;
  code: string;
  commission_rate: number;
  status: AffiliateStatus;
  notes?: string | null;
  /** Staff may correct or clear an account here; raw handles are normalised before saving. */
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
}

export async function upsertAffiliate(input: AffiliateInput): Promise<Affiliate> {
  const payload = {
    ...input,
    code: input.code.trim().toUpperCase(),
    // Normalised the same way as an application, so staff can paste "@name" and have it saved as
    // a profile URL — and so clearing a field stores NULL rather than an empty string.
    ...normalizeSocialAccounts(input),
  };

  if (isDemoMode()) return demoCommerceDb.upsertAffiliate(payload);

  const supabase = db();
  const { data, error } = input.id
    ? await supabase.from('affiliates').update(payload).eq('id', input.id).select('*').single()
    : await supabase.from('affiliates').insert([payload]).select('*').single();

  if (error) throw new Error(error.message);
  return data as Affiliate;
}

export async function setAffiliateStatus(id: string, status: AffiliateStatus): Promise<void> {
  if (isDemoMode()) {
    demoCommerceDb.setAffiliateStatus(id, status);
    return;
  }
  const { error } = await db().from('affiliates').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Records a payout. Commission already earned stays on `total_earned_npr`, so the running
 *  outstanding balance is `earned - paid` and history is never rewritten. */
export async function recordAffiliatePayout(id: string, amount: number, notes?: string): Promise<void> {
  if (isDemoMode()) {
    demoCommerceDb.recordAffiliatePayout(id, amount, notes);
    return;
  }

  const supabase = db();
  const { data, error: readError } = await supabase
    .from('affiliates')
    .select('total_paid_npr, payout_notes')
    .eq('id', id)
    .single();
  if (readError) throw new Error(readError.message);

  const nextPaid = Number(data?.total_paid_npr ?? 0) + amount;
  const { error } = await supabase
    .from('affiliates')
    .update({
      total_paid_npr: nextPaid,
      payout_notes: notes ? `${data?.payout_notes ? `${data.payout_notes}\n` : ''}${notes}` : data?.payout_notes,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteAffiliate(id: string): Promise<void> {
  if (isDemoMode()) {
    demoCommerceDb.deleteAffiliate(id);
    return;
  }
  const { error } = await db().from('affiliates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Public programme application. Works signed-out: the RLS policy only lets a caller insert a
 * `pending` row with zero earnings, so this cannot be abused to self-approve.
 */
export async function applyAsAffiliate(application: AffiliateApplication): Promise<Affiliate> {
  // Normalise here rather than trusting the caller: an application can arrive from either join
  // form, and the database CHECK constraints in migration 0017 expect canonical URLs.
  const socials = normalizeSocialAccounts(application);

  if (isDemoMode()) return demoCommerceDb.applyAffiliate({ ...application, ...socials });

  const { data, error } = await db()
    .from('affiliates')
    .insert([
      {
        name: application.name,
        phone: application.phone,
        email: application.email ?? null,
        code: (application.preferred_code?.trim() || suggestAffiliateCode(application.name)).toUpperCase(),
        status: 'pending',
        notes: application.notes ?? null,
        ...socials,
      },
    ])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Affiliate;
}

/* ─────────────────────────────────────────────────────── referral plumbing */

const REFERRAL_KEY = 'abh-referral-code';

/** Builds a readable, unique-ish code from a name, e.g. "Nirmala Khadka" → "NIRMALA-K7". */
export function suggestAffiliateCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .slice(0, 2)
    .join('')
    .slice(0, 12);

  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${base || 'ALIKATI'}-${suffix}`;
}

/** Persists `?ref=CODE` so the referral survives the whole visit, not just one page. */
export function captureReferralFromUrl(search: string): string | null {
  if (typeof window === 'undefined') return null;

  const code = new URLSearchParams(search).get('ref')?.trim().toUpperCase();
  if (!code) return getStoredReferralCode();

  try {
    // 60 days, matching a typical attribution window.
    window.localStorage.setItem(REFERRAL_KEY, code);
  } catch {
    /* private mode — the referral simply will not persist */
  }
  return code;
}

export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

/** Referral links are shareable URLs, optionally pointing straight at a product. */
export function buildReferralLink(code: string, path = '/'): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${path}?ref=${encodeURIComponent(code.toUpperCase())}`;
}
