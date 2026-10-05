import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AUTH_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

export { isSupabaseConfigured, isDemoMode, DEMO_CREDENTIALS } from '@/lib/supabase/config';

/** Shape of the cookie batch handed to `setAll` by @supabase/ssr. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Where unauthenticated staff are sent. The login page lives at `/login` — outside the
 * `/admin` layout — so the admin guard cannot redirect a user to a page it also guards.
 */
export const LOGIN_PATH = '/login';
export const ADMIN_HOME = '/admin';

/**
 * Refresh the Supabase auth session and protect every `/admin` route behind `/login`.
 *
 * In demo mode there is no session to inspect, so the redirect is skipped here and the
 * client-side admin layout applies the guard instead.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() revalidates the token with Supabase — do not rely on getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith(ADMIN_HOME);
  const isLoginRoute = pathname.startsWith(LOGIN_PATH);

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_HOME;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
