import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

/** Shape of the cookie batch handed to `setAll` by @supabase/ssr. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-side Supabase client for Server Components, Route Handlers and Server Actions.
 * Reads and writes the auth session through Next.js cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // Enforce our flags over the library's defaults — see cookie-options.ts.
              cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Session refresh is handled by middleware, so this is safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * Service-role client for trusted server-only work (booking writes, admin exports).
 *
 * ⚠️ Bypasses Row Level Security. Never import this into a client component, and never
 * expose `SUPABASE_SERVICE_ROLE_KEY` with a NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
