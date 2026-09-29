/**
 * Client-safe configuration helpers.
 *
 * Kept separate from `lib/supabase/middleware.ts` (which imports `next/server`) so both
 * server components and browser components can import these without pulling in
 * server-only modules.
 */

/** True when a Supabase project is wired up through environment variables. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * True when the app is running against the bundled seed data instead of a live database.
 * Demo mode lets the whole site be reviewed before Supabase is provisioned.
 */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

/** Stated on the login screen so the console is reviewable in demo mode. */
export const DEMO_CREDENTIALS = {
  email: 'admin@alikati.demo',
  password: 'demo1234',
  full_name: 'Rita D.',
  role: 'admin' as const,
  storageKey: 'abh_demo_session',
};

/**
 * Stated on the customer login screen so the account area is reviewable in demo mode.
 * The phone number matches one of the bundled demo orders, so the order history is populated.
 * This is a throwaway credential for bundled seed data only — never a real secret.
 */
export const DEMO_CUSTOMER = {
  email: 'sita@alikati.demo',
  password: 'demo1234',
  full_name: 'Sita Joshi',
  phone: '9812345611',
  default_address: 'Ward 4, near Attariya Chowk, Kailali',
  default_city: 'Attariya',
  storageKey: 'abh_demo_customer_session',
} as const;

/** Canonical site URL used for metadata, sitemap and Open Graph tags. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Fallback contact numbers when `salon_settings` has not been loaded. */
export const FALLBACK_CONTACT = {
  phone: process.env.NEXT_PUBLIC_PHONE ?? '+977-9869512756',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '9779869512756',
  email: 'alikatibeautyhome@gmail.com',
  address: 'Mahendranagar Road, Attariya Chowk, Kailali, Nepal',
} as const;

/** Social profiles — overridden at runtime by the `salon_settings` row. */
export const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/share/1Dgw2YFiiZ/',
  instagram: 'https://www.instagram.com/nirmala_khadka098',
  tiktok: 'https://www.tiktok.com/@alikatibeautyhome5',
} as const;
