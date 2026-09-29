import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // `/admin/*` needs the session refreshed and the guard applied; `/login` needs the
  // refresh so an already-signed-in staff member is sent straight to the dashboard.
  matcher: ['/admin/:path*', '/login'],
};
