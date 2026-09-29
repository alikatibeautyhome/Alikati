import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (public site interactions + admin SPA).
 *
 * Throws a clear error when the project is not configured — callers should guard with
 * `isSupabaseConfigured()` (see `lib/supabase/config.ts`) or run in demo mode.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
    );
  }

  return createBrowserClient(url, anonKey);
}

let cached: ReturnType<typeof createClient> | null = null;

/** Singleton accessor for client components. */
export function getSupabaseBrowserClient() {
  if (!cached) cached = createClient();
  return cached;
}
