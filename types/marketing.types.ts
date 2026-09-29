/**
 * Marketing contracts — coupons and the affiliate programme.
 *
 * Mirrors `supabase/migrations/20260928000008_coupons_affiliates.sql`.
 */

export type DiscountType = 'percent' | 'fixed';
export type AffiliateStatus = 'pending' | 'active' | 'suspended';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order_npr: number;
  max_discount_npr: number | null;
  usage_limit: number | null;
  used_count: number;
  per_customer_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Result of the advisory pre-check shown at checkout (never authoritative). */
export interface CouponPreview {
  valid: boolean;
  reason: string;
  code: string | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  discount_npr: number;
}

export interface Affiliate {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  code: string;
  commission_rate: number;
  status: AffiliateStatus;
  payout_notes: string | null;
  total_earned_npr: number;
  total_paid_npr: number;
  notes: string | null;
  /**
   * Social accounts, reviewed before an application is approved. Full `https://` URLs, mirroring
   * the `salon_settings` convention. Staff decide on the strength of these, so they are shown in
   * the affiliate table and editable in the console.
   */
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateApplication {
  name: string;
  phone: string;
  email?: string | null;
  /** Optional preferred code; the server normalises it and guarantees uniqueness. */
  preferred_code?: string | null;
  notes?: string | null;
  /**
   * At least one of these is required — migration 0017 refuses an application with none, because
   * the programme is approved on the strength of the applicant's audience. Raw input is fine:
   * `applyAsAffiliate` runs it through `lib/socials.ts` first.
   */
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
}

/** One row of the affiliate leaderboard computed from orders. */
export interface AffiliatePerformance {
  affiliate: Affiliate;
  orders: number;
  revenue_npr: number;
  commission_npr: number;
  outstanding_npr: number;
  last_order_at: string | null;
}

export interface CouponQuery {
  search?: string;
  activeOnly?: boolean;
  limit?: number;
}

/** Keys accepted by `salon_settings.home_section_order`. */
export const HOME_SECTION_KEYS = [
  'products',
  'services',
  'academy',
  'portfolio',
  'reviews',
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  products: 'Shop products',
  services: 'Salon services',
  academy: 'Beauty academy',
  portfolio: 'Portfolio',
  reviews: 'Client reviews',
};
