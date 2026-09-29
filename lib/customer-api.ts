/**
 * Client-side access for the CUSTOMER account area (sign-up, sign-in, profile, order history).
 *
 * Deliberately separate from `lib/api-client.ts` (staff/admin) and `lib/shop-api.ts` (server
 * reads): customer components must only ever touch this module, which talks to Supabase through
 * the browser client and relies on RLS for authorisation.
 *
 * In demo mode (no Supabase project configured) everything runs against an in-memory account
 * store plus a localStorage-persisted session, so the whole account journey is reviewable with
 * no environment variables. Passwords are never written to storage or to the console.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { DEMO_CUSTOMER, isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import type { Order } from '@/types/commerce.types';
import type { CustomerProfile, CustomerProfilePatch } from '@/types/database.types';

/** Fired on the window whenever the signed-in customer changes, so the header can re-render. */
const CUSTOMER_EVENT = 'abh:customer-changed';

/** Browser client accessor — throws if accidentally executed on the server. */
function db() {
  if (typeof window === 'undefined') {
    throw new Error('lib/customer-api.ts is browser-only. Use server helpers from server code.');
  }
  return getSupabaseBrowserClient();
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as T;
}

/** Notifies mounted listeners (the AuthProvider) that the session changed. */
function notifyCustomerChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CUSTOMER_EVENT));
}

/** Subscribe to session changes; returns an unsubscribe function. */
export function onCustomerChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CUSTOMER_EVENT, listener);
  return () => window.removeEventListener(CUSTOMER_EVENT, listener);
}

/** Last 10 digits of a phone number — the part that identifies a Nepali mobile. */
function phoneTail(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^0-9]/g, '').slice(-10);
}

type MetaRecord = Record<string, unknown> | undefined;

function metaString(meta: MetaRecord, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/* ───────────────────────────────────────────────────────────── demo store ── */

interface DemoAccount {
  /** In-memory only — never persisted, never logged. */
  password: string;
  profile: CustomerProfile;
}

const DEMO_CUSTOMER_ID = 'c0000000-0000-4000-8000-000000000001';

const demoAccounts = new Map<string, DemoAccount>();
let demoSeeded = false;

function seedDemoAccounts(): void {
  if (demoSeeded) return;
  demoSeeded = true;

  const now = new Date().toISOString();
  demoAccounts.set(DEMO_CUSTOMER.email.toLowerCase(), {
    password: DEMO_CUSTOMER.password,
    profile: {
      id: DEMO_CUSTOMER_ID,
      email: DEMO_CUSTOMER.email,
      full_name: DEMO_CUSTOMER.full_name,
      phone: DEMO_CUSTOMER.phone,
      default_address: DEMO_CUSTOMER.default_address,
      default_city: DEMO_CUSTOMER.default_city,
      marketing_opt_in: false,
      created_at: now,
      updated_at: now,
    },
  });
}

function readDemoSession(): CustomerProfile | null {
  try {
    const raw = window.localStorage.getItem(DEMO_CUSTOMER.storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerProfile;
  } catch {
    return null;
  }
}

function writeDemoSession(profile: CustomerProfile | null): void {
  try {
    if (profile) {
      window.localStorage.setItem(DEMO_CUSTOMER.storageKey, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(DEMO_CUSTOMER.storageKey);
    }
  } catch {
    // A private-mode browser may refuse localStorage; the session simply stays in memory.
  }
  notifyCustomerChanged();
}

/** In demo mode the account lives in memory; recover it from the session after a reload. */
function demoAccountFor(email: string, session: CustomerProfile): DemoAccount {
  const key = email.toLowerCase();
  const existing = demoAccounts.get(key);
  if (existing) return existing;

  const account: DemoAccount = { password: '', profile: session };
  demoAccounts.set(key, account);
  return account;
}

/* ────────────────────────────────────────────────────────────── contracts ── */

export interface SignUpInput {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  marketing_opt_in?: boolean;
}

export type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: string };

export type SignInResult = { ok: true } | { ok: false; error: string };

/* ──────────────────────────────────────────────────────────────── actions ── */

/**
 * Creates a customer account. Supabase may either return a session immediately (email
 * confirmation disabled) or ask the shopper to confirm their address first — both are handled
 * through `needsEmailConfirmation`.
 */
export async function signUpCustomer(input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim();
  const full_name = input.full_name.trim();
  const phone = input.phone?.trim() ? input.phone.trim() : null;
  const marketing_opt_in = Boolean(input.marketing_opt_in);

  if (isDemoMode()) {
    seedDemoAccounts();
    const key = email.toLowerCase();
    if (demoAccounts.has(key)) {
      return { ok: false, error: 'That email is already registered. Try signing in instead.' };
    }

    const now = new Date().toISOString();
    const profile: CustomerProfile = {
      id: crypto.randomUUID(),
      email,
      full_name,
      phone,
      default_address: null,
      default_city: null,
      marketing_opt_in,
      created_at: now,
      updated_at: now,
    };
    demoAccounts.set(key, { password: input.password, profile });
    writeDemoSession(profile); // demo mode signs in straight away (no email step)
    return { ok: true, needsEmailConfirmation: false };
  }

  const { data, error } = await db().auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name, phone: phone ?? '', marketing_opt_in },
    },
  });

  if (error) return { ok: false, error: error.message };

  notifyCustomerChanged();
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function signInCustomer(email: string, password: string): Promise<SignInResult> {
  if (isDemoMode()) {
    seedDemoAccounts();
    const account = demoAccounts.get(email.trim().toLowerCase());
    if (!account || account.password !== password) {
      return { ok: false, error: 'Incorrect email or password (demo mode).' };
    }
    writeDemoSession(account.profile);
    return { ok: true };
  }

  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: error.message };

  notifyCustomerChanged();
  return { ok: true };
}

export async function signOutCustomer(): Promise<void> {
  if (isDemoMode()) {
    writeDemoSession(null);
    return;
  }

  await db().auth.signOut();
  notifyCustomerChanged();
}

/** The signed-in customer, or `null`. */
export async function getCurrentCustomer(): Promise<CustomerProfile | null> {
  if (isDemoMode()) {
    seedDemoAccounts();
    return readDemoSession();
  }

  const supabase = db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('customers').select('*').eq('id', user.id).maybeSingle();
  if (data) return data as CustomerProfile;

  // The row is normally created by the `handle_new_customer` trigger; fall back to the auth
  // metadata if the account predates migration 0006.
  const meta = user.user_metadata as MetaRecord;
  return {
    id: user.id,
    email: user.email ?? '',
    full_name: metaString(meta, 'full_name') ?? 'Customer',
    phone: metaString(meta, 'phone'),
    default_address: null,
    default_city: null,
    marketing_opt_in: meta?.marketing_opt_in === true,
    created_at: user.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Updates the signed-in customer's own profile row. */
export async function updateCustomerProfile(patch: CustomerProfilePatch): Promise<CustomerProfile> {
  if (isDemoMode()) {
    seedDemoAccounts();
    const session = readDemoSession();
    if (!session) throw new Error('updateCustomerProfile: not signed in.');

    const account = demoAccountFor(session.email, session);
    const updated: CustomerProfile = { ...account.profile, ...patch, updated_at: new Date().toISOString() };
    account.profile = updated;
    writeDemoSession(updated);
    return updated;
  }

  const supabase = db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('updateCustomerProfile: not signed in.');

  return unwrap(
    await supabase.from('customers').update(patch).eq('id', user.id).select().single(),
    'updateCustomerProfile'
  ) as CustomerProfile;
}

/** The signed-in customer's order history, newest first. Guests receive an empty list. */
export async function getMyOrders(): Promise<Order[]> {
  if (isDemoMode()) {
    seedDemoAccounts();
    const session = readDemoSession();
    if (!session?.phone) return [];

    const digits = phoneTail(session.phone);
    return demoCommerceDb
      .getOrders()
      .filter((order) => phoneTail(order.customer_phone) === digits)
      .map((order) => ({ ...order, customer_id: order.customer_id ?? session.id }));
  }

  const supabase = db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return unwrap(
    await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
    'getMyOrders'
  ) as Order[];
}

/**
 * Links a guest order to the signed-in customer, but only when the mobile number matches the
 * one on their account. Works through a SECURITY DEFINER RPC in live mode.
 */
export async function attachOrderToCustomer(reference: string, phone: string): Promise<void> {
  if (isDemoMode()) {
    seedDemoAccounts();
    const session = readDemoSession();
    if (!session) throw new Error('attachOrderToCustomer: not signed in.');

    const digits = phoneTail(phone);
    const order = demoCommerceDb
      .getOrders()
      .find(
        (row) =>
          row.reference.toUpperCase() === reference.trim().toUpperCase() &&
          phoneTail(row.customer_phone) === digits
      );

    if (!order) throw new Error('attachOrderToCustomer: no matching order.');
    demoCommerceDb.updateOrder(order.id, { customer_id: session.id });
    return;
  }

  const { error } = await db().rpc('attach_order_to_customer', {
    p_reference: reference.trim(),
    p_phone: phone.trim(),
  });
  if (error) throw new Error(`attachOrderToCustomer: ${error.message}`);
}
