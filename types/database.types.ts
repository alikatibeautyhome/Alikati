/**
 * Database contracts for the Alikati Beauty Home platform.
 *
 * These interfaces mirror `supabase/migrations/0001_schema.sql`. When the schema changes,
 * regenerate or update this file first — every query wrapper in `lib/api.ts` and
 * `lib/api-client.ts` is typed against it.
 */

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type LeadStatus = 'new' | 'contacted' | 'enrolled' | 'archived';

export type ServiceCategory = 'hair' | 'bridal' | 'nails' | 'skin' | 'packages';

export interface Service {
  id: string;
  title: string;
  slug: string;
  category: ServiceCategory;
  description: string | null;
  duration_minutes: number;
  price_npr: number;
  discount_price_npr: number | null;
  image_url: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  notes: string | null;
  status: AppointmentStatus;
  total_amount_npr: number;
  is_walk_in: boolean;
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
  /** Joined relation, present when the query selects `service:services(...)`. */
  service?: Pick<Service, 'id' | 'title' | 'category'> &
    Partial<Pick<Service, 'duration_minutes' | 'price_npr' | 'discount_price_npr'>>;
}

export interface AcademyCourse {
  id: string;
  title: string;
  slug: string;
  duration_weeks: number;
  fee_npr: number;
  syllabus: string[];
  is_enrolling: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademyLead {
  id: string;
  student_name: string;
  student_phone: string;
  course_id: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  course?: Pick<AcademyCourse, 'id' | 'title' | 'fee_npr' | 'duration_weeks'>;
}

export interface GalleryItem {
  id: string;
  title: string | null;
  category: ServiceCategory;
  image_url: string;
  before_image_url: string | null;
  display_order: number;
  is_visible: boolean;
  created_at: string;
}

export interface SalonSettings {
  id: number;
  phone: string;
  whatsapp_number: string;
  address: string;
  announcement_text: string;
  announcement_active: boolean;
  opening_time: string;
  closing_time: string;
  updated_at: string;

  /* ── Store / checkout settings (added with the e-commerce migration) ───────── */
  store_enabled: boolean;
  shipping_fee_npr: number;
  free_shipping_threshold_npr: number;
  cod_enabled: boolean;
  bank_transfer_enabled: boolean;
  payment_instructions: string;
  support_email: string | null;
  delivery_note: string | null;

  /* ── Public contact details and social profiles ────────────────────────────── */
  email: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;

  /* ── Owner-controlled site settings (migration 0008) ───────────────────────── */
  cookie_notice_enabled: boolean;
  cookie_notice_text: string | null;
  app_prompt_enabled: boolean;
  app_prompt_text: string | null;
  /** Landing-page section keys in display order, e.g. ["products","services",…]. */
  home_section_order: string[];
  affiliate_enabled: boolean;
  affiliate_commission_rate: number;
  affiliate_terms: string | null;

  /* ── Payment screen, statement uploads and Nepali dates (migration 0011) ───── */
  payment_qr_enabled: boolean;
  /** Encoded into a generated QR, e.g. `esewa:9869512756`. */
  payment_qr_content: string | null;
  /** The owner's own receive-QR image; takes precedence over generated content. */
  payment_qr_image_url: string | null;
  payment_note: string | null;
  /** Default validity (days) applied to a new coupon. */
  coupon_default_days: number;
  /** Show Bikram Sambat dates alongside AD dates. */
  nepali_dates: boolean;

  /* ── Product watermark badge (migration 0019) ──────────────────────────────── */
  /** Master switch for the brand badge over product imagery. */
  watermark_enabled: boolean;
  /**
   * Public URL of the uploaded PNG brand mark. `null` means nothing has been uploaded, and the
   * storefront then renders no badge at all rather than an empty box.
   */
  watermark_logo_url: string | null;
  /** Badge height in CSS pixels. The database constrains this to 32–64. */
  watermark_size_px: number;

  /* ── Editable landing-page hero (migration 0013) ───────────────────────────── */
  /** Uploaded hero photograph; falls back to the bundled placeholder when null. */
  hero_image_url: string | null;
  hero_heading: string | null;
  hero_subheading: string | null;
  hero_badge_text: string | null;

  /* ── Landing-page promotional band (migration 0015) ────────────────────────── */
  promo_enabled: boolean;
  promo_eyebrow: string | null;
  promo_headline: string | null;
  promo_subheadline: string | null;
  promo_cta_label: string | null;
  promo_href: string | null;
}

/**
 * One photograph in the landing-page hero slideshow (migration 0014).
 *
 * Ordered by `display_order`; only `is_active` slides are shown to the public. `heading` and
 * `subheading` are optional per-slide overrides of the hero copy.
 */
export interface HeroSlide {
  id: string;
  image_url: string;
  alt_text: string | null;
  heading: string | null;
  subheading: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'staff';
  /** Deactivating revokes console access immediately — see is_staff() in migration 0011. */
  is_active: boolean;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A shopper account (`public.customers`), created by the storefront sign-up flow.
 * Mirrors the shape of `StaffProfile` — customers and staff are separate identities.
 */
export interface CustomerProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  default_address: string | null;
  default_city: string | null;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

/** Fields a customer may edit on their own profile. */
export type CustomerProfilePatch = Partial<
  Pick<CustomerProfile, 'full_name' | 'phone' | 'default_address' | 'default_city' | 'marketing_opt_in'>
>;

/** Payload accepted by `POST /api/booking`. */
export interface BookingRequestPayload {
  client_name: string;
  client_phone: string;
  service_id: string;
  /** YYYY-MM-DD */
  booking_date: string;
  /** HH:mm */
  booking_time: string;
  notes?: string;
}

/** Normalised result of a booking attempt. */
export interface BookingResult {
  ok: boolean;
  appointment_id?: string;
  reference_code?: string;
  whatsapp_url?: string;
  error?: string;
  /** Field-level validation messages keyed by payload field name. */
  fields?: Record<string, string>;
}

/** Dashboard KPI aggregate for a single day. */
export interface DailyKpis {
  total: number;
  pending: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  projectedRevenue: number;
  realisedRevenue: number;
}

/** Coarse arrival bucket, used for grouping in the console. Mirrors migration 0031. */
export type TrafficSource = 'direct' | 'search' | 'social' | 'referral' | 'affiliate';

/** Coarse device class. 'unknown' covers a missing or unrecognisable user-agent. */
export type TrafficDevice = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/**
 * One page view.
 *
 * Deliberately carries no IP address and no user-agent string — see the header of migration 0031.
 * `visitor_hash` is a daily-rotating salted digest computed in the API route, so it identifies a
 * browser for one day and cannot be resolved back to an address.
 */
export interface TrafficEvent {
  id: number;
  created_at: string;
  path: string;
  source: TrafficSource;
  source_detail: string | null;
  referrer_host: string | null;
  device: TrafficDevice;
  browser: string | null;
  os: string | null;
  /** ISO-3166 alpha-2 from the platform edge, or null when the edge did not say. */
  country: string | null;
  /** Random per-tab value from sessionStorage. Null when storage is unavailable. */
  session_id: string | null;
  visitor_hash: string;
  is_bot: boolean;
}

/** Headline figures for a window, from `public.traffic_summary`. */
export interface TrafficSummaryRow {
  views: number;
  visitors: number;
  sessions: number;
  bounces: number;
}

/** One Nepal day, from `public.traffic_daily`. Empty days are present with zeroes. */
export interface TrafficDailyRow {
  day: string;
  views: number;
  visitors: number;
  sessions: number;
}
