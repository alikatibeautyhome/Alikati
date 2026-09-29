/**
 * Client helpers for staff & user administration.
 *
 * These call `/api/admin/staff`, which does the Auth-admin work with the service key. The
 * browser sends its own Supabase access token so the route can verify the caller is an active
 * administrator — the service key never reaches the client.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/supabase/config';

export type AccountRole = 'admin' | 'staff' | 'customer';

export interface StaffAccount {
  id: string;
  email: string;
  full_name: string;
  role: AccountRole;
  is_active: boolean;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
  /** Only present on the live list response. */
  email_confirmed?: boolean;
  last_sign_in_at?: string | null;
}

export interface StaffListResult {
  ok: boolean;
  staff: StaffAccount[];
  /** The signed-in admin's own id, so the UI can prevent self-lockout. */
  you?: string;
  error?: string;
}

export interface MutationResult {
  ok: boolean;
  id?: string;
  error?: string;
  fields?: Record<string, string>;
}

async function requestHeaders(): Promise<HeadersInit> {
  if (isDemoMode()) return { 'Content-Type': 'application/json' };
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch('/api/admin/staff', {
    method,
    headers: await requestHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  // A non-JSON body means something upstream failed (proxy, crash) — surface it rather than
  // throwing an opaque parse error in the UI.
  try {
    return (await response.json()) as T;
  } catch {
    return {
      ok: false,
      error: `Unexpected server response (${response.status}).`,
    } as unknown as T;
  }
}

export async function listStaff(): Promise<StaffListResult> {
  return call<StaffListResult>('GET');
}

export async function createStaff(input: {
  email: string;
  password: string;
  full_name: string;
  role: AccountRole;
  phone?: string;
}): Promise<MutationResult> {
  return call<MutationResult>('POST', input);
}

export async function updateStaff(input: {
  id: string;
  role?: AccountRole;
  full_name?: string;
  phone?: string | null;
  is_active?: boolean;
  /** Set to change a person's password on their behalf. */
  password?: string;
}): Promise<MutationResult> {
  return call<MutationResult>('PATCH', input);
}
