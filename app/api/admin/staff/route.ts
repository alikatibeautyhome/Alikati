import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Staff & user administration.
 *
 * Creating or editing a login is an Auth **admin** operation, which the browser cannot perform
 * with a publishable key — it needs the service role. That is why this lives in a route handler
 * rather than in `lib/shop-admin-api.ts`, and why the caller is re-authenticated here:
 *
 *   1. The caller's own Supabase access token arrives in `Authorization: Bearer …`.
 *   2. It is verified against the Auth server (`auth.getUser(token)`) — a forged or expired token
 *      is rejected.
 *   3. Their `profiles` row is read and must be `role = 'admin'` **and** `is_active`.
 *
 * Only then does the service-role client touch anything. Every response is therefore scoped to a
 * verified admin, and the browser never sees the service key.
 */

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'staff';
  is_active: boolean;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
}

/** Verifies the bearer token and returns the caller's profile when they are an active admin. */
async function requireAdmin(
  request: NextRequest
): Promise<{ ok: true; profile: StaffRow } | { ok: false; response: NextResponse }> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 }),
    };
  }

  // Step 2 — verify the token with the Auth server.
  const authClient = await createClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Session expired. Sign in again.' }, { status: 401 }),
    };
  }

  // Step 3 — confirm the role, reading through the service client so a broken RLS policy cannot
  // accidentally let a non-admin through.
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' },
        { status: 503 }
      ),
    };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, role, is_active, phone, last_login_at, created_at')
    .eq('id', user.id)
    .maybeSingle<StaffRow>();

  if (!profile || profile.role !== 'admin' || profile.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'Only an active administrator can manage accounts.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, profile };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Supabase enforces its own minimum; this gives a clearer message than a 422 from Auth. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────── GET ── */

/** Lists every account: profile fields plus whether an auth login exists. */
export async function GET(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      staff: [
        {
          id: 'demo-staff-0001',
          email: 'admin@alikati.demo',
          full_name: 'Rita D.',
          role: 'admin',
          is_active: true,
          phone: null,
          last_login_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      note: 'Demo mode — accounts are not persisted.',
    });
  }

  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const admin = createAdminClient()!;
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, full_name, role, is_active, phone, last_login_at, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[api/admin/staff] list failed:', error.message);
    return NextResponse.json({ ok: false, error: 'Could not load accounts.' }, { status: 500 });
  }

  // Auth metadata (last sign-in, confirmation) is not exposed on `profiles`.
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
  const byId = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

  const staff = (profiles ?? []).map((row) => {
    const authUser = byId.get(row.id as string);
    return {
      ...row,
      email_confirmed: Boolean(authUser?.email_confirmed_at),
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
    };
  });

  return NextResponse.json({ ok: true, staff, you: gate.profile.id });
}

/* ────────────────────────────────────────────────────────────────── POST ── */

/**
 * Creates an account. `role = 'admin' | 'staff'` provisions a console user; `role = 'customer'`
 * creates a shopper login. The `role` claim must be present in `user_metadata` — that is exactly
 * what `handle_new_staff_user()` (migration 0010) requires before it will create a profile, so
 * a customer can never acquire staff access by being created here or anywhere else.
 */
export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, error: 'Creating accounts needs a configured Supabase project.' },
      { status: 503 }
    );
  }

  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const full_name = String(body.full_name ?? '').trim().slice(0, 120);
  const phone = String(body.phone ?? '').trim().slice(0, 20) || null;
  const requestedRole = String(body.role ?? 'staff');
  const role = requestedRole === 'admin' ? 'admin' : requestedRole === 'customer' ? 'customer' : 'staff';

  const fields: Record<string, string> = {};
  if (!isValidEmail(email)) fields.email = 'Enter a valid email address.';
  if (!full_name) fields.full_name = 'Enter the person’s name.';
  const pwProblem = passwordProblem(password);
  if (pwProblem) fields.password = pwProblem;
  if (Object.keys(fields).length > 0) {
    return NextResponse.json({ ok: false, error: 'Please fix the highlighted fields.', fields }, { status: 422 });
  }

  const admin = createAdminClient()!;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // The role claim drives the profile trigger. A customer gets no `profiles` row at all.
    user_metadata: { full_name, role, phone },
  });

  if (error) {
    console.error('[api/admin/staff] create failed:', error.message);
    const duplicate = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: duplicate ? 'That email already has an account.' : 'Could not create the account.',
      },
      { status: duplicate ? 409 : 500 }
    );
  }

  // Staff/admins get a profile from the trigger; add the phone number to it.
  if (role !== 'customer' && phone && data.user) {
    await admin.from('profiles').update({ phone }).eq('id', data.user.id);
  }

  return NextResponse.json({ ok: true, id: data.user?.id, email, role }, { status: 201 });
}

/* ───────────────────────────────────────────────────────────────── PATCH ── */

/** Updates a role, contact number, display name, password or active state. */
export async function PATCH(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, error: 'Editing accounts needs a configured Supabase project.' },
      { status: 503 }
    );
  }

  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Which account?' }, { status: 400 });

  const admin = createAdminClient()!;

  // Guard rails: an admin must not lock themselves — or the last admin — out of the console.
  const { data: target } = await admin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', id)
    .maybeSingle<{ id: string; role: string; is_active: boolean }>();

  const wantsDeactivate = body.is_active === false;
  const wantsDemote = body.role === 'staff' || body.role === 'customer';
  const isSelf = id === gate.profile.id;

  if (target?.role === 'admin' && (wantsDeactivate || wantsDemote)) {
    if (isSelf) {
      return NextResponse.json(
        { ok: false, error: 'You cannot remove your own admin access.' },
        { status: 409 }
      );
    }
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { ok: false, error: 'This is the only active administrator — promote someone else first.' },
        { status: 409 }
      );
    }
  }

  const profilePatch: Record<string, unknown> = {};
  if (body.role !== undefined) profilePatch.role = String(body.role);
  if (body.full_name !== undefined) profilePatch.full_name = String(body.full_name).trim().slice(0, 120);
  if (body.phone !== undefined) profilePatch.phone = String(body.phone).trim().slice(0, 20) || null;
  if (body.is_active !== undefined) profilePatch.is_active = Boolean(body.is_active);

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', id);
    if (error) {
      console.error('[api/admin/staff] profile update failed:', error.message);
      return NextResponse.json({ ok: false, error: 'Could not update the account.' }, { status: 500 });
    }
  }

  const authPatch: Record<string, unknown> = {};
  if (body.password) {
    const pwProblem = passwordProblem(String(body.password));
    if (pwProblem) {
      return NextResponse.json({ ok: false, error: pwProblem, fields: { password: pwProblem } }, { status: 422 });
    }
    authPatch.password = String(body.password);
  }
  if (body.email) authPatch.email = String(body.email).trim().toLowerCase();

  if (Object.keys(authPatch).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, authPatch);
    if (error) {
      console.error('[api/admin/staff] auth update failed:', error.message);
      return NextResponse.json({ ok: false, error: `Login not updated: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id });
}
