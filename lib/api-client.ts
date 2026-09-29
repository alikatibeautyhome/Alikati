/**
 * Client-side data access for the admin console (and the public academy lead form).
 *
 * All admin screens are client components per the architecture spec (CSR dashboards with
 * realtime refresh), so every function here talks to Supabase through the browser client and
 * relies on RLS + the signed-in staff session for authorisation.
 *
 * In demo mode (no Supabase project configured) these functions operate on the in-memory
 * demo store, and `signInStaff` accepts the demo credentials listed on the login screen.
 */
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { DEMO_CREDENTIALS, isDemoMode } from '@/lib/supabase/config';
import { demoDb } from '@/lib/demo-data';
import type {
  AcademyCourse,
  AcademyLead,
  Appointment,
  AppointmentStatus,
  DailyKpis,
  GalleryItem,
  LeadStatus,
  SalonSettings,
  Service,
  ServiceCategory,
  StaffProfile,
} from '@/types/database.types';

/** Browser client accessor — throws if accidentally executed on the server. */
function db() {
  if (typeof window === 'undefined') {
    throw new Error('lib/api-client.ts is browser-only. Use lib/api.ts from server code.');
  }
  return getSupabaseBrowserClient();
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data as T;
}

/* ------------------------------------------------------------------- auth */

export async function signInStaff(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoMode()) {
    const match =
      email.trim().toLowerCase() === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password;
    if (!match) return { ok: false, error: 'Incorrect email or password (demo mode).' };
    window.localStorage.setItem(
      DEMO_CREDENTIALS.storageKey,
      JSON.stringify({
        email: DEMO_CREDENTIALS.email,
        full_name: DEMO_CREDENTIALS.full_name,
        role: DEMO_CREDENTIALS.role,
      })
    );
    return { ok: true };
  }

  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOutStaff(): Promise<void> {
  if (isDemoMode()) {
    window.localStorage.removeItem(DEMO_CREDENTIALS.storageKey);
    return;
  }
  await db().auth.signOut();
}

/** The signed-in staff member, or `null`. Used by the admin layout guard. */
export async function getCurrentStaff(): Promise<StaffProfile | null> {
  if (isDemoMode()) {
    const raw = window.localStorage.getItem(DEMO_CREDENTIALS.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email: string; full_name: string; role: 'admin' | 'staff' };
    return {
      id: 'demo-staff-0001',
      email: parsed.email,
      full_name: parsed.full_name,
      role: parsed.role,
      is_active: true,
      phone: null,
      last_login_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const supabase = db();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

  return (
    (data as StaffProfile | null) ?? {
      id: user.id,
      email: user.email ?? '',
      full_name: (user.user_metadata?.full_name as string) ?? 'Staff Member',
      role: 'staff',
      // A signed-in user with no profile row is not staff — the admin layout must reject them.
      // (is_staff() in the database agrees: it requires a profile row with a staff role.)
      is_active: false,
      phone: null,
      last_login_at: null,
      created_at: user.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );
}

/* ----------------------------------------------------------------- services */

export async function getServices(includeInactive = true): Promise<Service[]> {
  if (isDemoMode()) return demoDb.getServices({ includeInactive });

  const supabase = db();
  const query = supabase.from('services').select('*');
  const filtered = includeInactive ? query : query.eq('is_active', true);

  return unwrap(
    await filtered.order('category', { ascending: true }).order('title', { ascending: true }),
    'getServices'
  ) as Service[];
}

export async function upsertService(
  input: Partial<Service> & { title: string; slug: string }
): Promise<Service> {
  if (isDemoMode()) return demoDb.upsertService(input);

  return unwrap(
    await db().from('services').upsert(input, { onConflict: 'id' }).select().single(),
    'upsertService'
  ) as Service;
}

export async function updateService(id: string, patch: Partial<Service>): Promise<Service> {
  if (isDemoMode()) return demoDb.updateService(id, patch);

  return unwrap(
    await db().from('services').update(patch).eq('id', id).select().single(),
    'updateService'
  ) as Service;
}

export const toggleServiceActive = (id: string, is_active: boolean) =>
  updateService(id, { is_active });

export const setServiceDiscount = (id: string, discount_price_npr: number | null) =>
  updateService(id, { discount_price_npr });

export async function deleteService(id: string): Promise<void> {
  if (isDemoMode()) return demoDb.deleteService(id);

  const { error } = await db().from('services').delete().eq('id', id);
  if (error) throw new Error(`deleteService: ${error.message}`);
}

/* ------------------------------------------------------------------ courses */

export async function getAcademyCourses(): Promise<AcademyCourse[]> {
  if (isDemoMode()) return demoDb.getCourses();

  return unwrap(
    await db().from('academy_courses').select('*').order('created_at', { ascending: true }),
    'getAcademyCourses'
  ) as AcademyCourse[];
}

/* -------------------------------------------------------------------- leads */

export async function getAcademyLeads(status?: LeadStatus): Promise<AcademyLead[]> {
  if (isDemoMode()) return demoDb.getLeads(status);

  const supabase = db();
  const query = supabase
    .from('academy_leads')
    .select('*, course:academy_courses(id, title, fee_npr, duration_weeks)');

  const filtered = status ? query.eq('status', status) : query;

  return unwrap(
    await filtered.order('created_at', { ascending: false }),
    'getAcademyLeads'
  ) as AcademyLead[];
}

export async function updateLead(
  id: string,
  patch: { status?: LeadStatus; notes?: string }
): Promise<AcademyLead> {
  if (isDemoMode()) return demoDb.updateLead(id, patch);

  return unwrap(
    await db().from('academy_leads').update(patch).eq('id', id).select().single(),
    'updateLead'
  ) as AcademyLead;
}

/** Public academy inquiry submission (used by the lead form on /academy). */
export async function createAcademyLead(input: {
  student_name: string;
  student_phone: string;
  course_id: string | null;
  notes?: string;
}): Promise<AcademyLead> {
  if (isDemoMode()) return demoDb.createLead(input);

  return unwrap(
    await db()
      .from('academy_leads')
      .insert([{ ...input, notes: input.notes ?? null, status: 'new' }])
      .select()
      .single(),
    'createAcademyLead'
  ) as AcademyLead;
}

/* ------------------------------------------------------------------ gallery */

export async function getGalleryItems(includeHidden = true): Promise<GalleryItem[]> {
  if (isDemoMode()) return demoDb.getGallery(includeHidden);

  const supabase = db();
  const query = supabase.from('gallery_items').select('*');
  const filtered = includeHidden ? query : query.eq('is_visible', true);

  return unwrap(
    await filtered
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    'getGalleryItems'
  ) as GalleryItem[];
}

export async function upsertGalleryItem(
  input: Partial<GalleryItem> & { image_url: string }
): Promise<GalleryItem> {
  if (isDemoMode()) return demoDb.upsertGalleryItem(input);

  return unwrap(
    await db().from('gallery_items').upsert(input, { onConflict: 'id' }).select().single(),
    'upsertGalleryItem'
  ) as GalleryItem;
}

export async function updateGalleryItem(
  id: string,
  patch: Partial<GalleryItem>
): Promise<GalleryItem> {
  if (isDemoMode()) return demoDb.updateGalleryItem(id, patch);

  return unwrap(
    await db().from('gallery_items').update(patch).eq('id', id).select().single(),
    'updateGalleryItem'
  ) as GalleryItem;
}

export const setGalleryVisibility = (id: string, is_visible: boolean) =>
  updateGalleryItem(id, { is_visible });

export const reorderGallery = (id: string, display_order: number) =>
  updateGalleryItem(id, { display_order });

export async function deleteGalleryItem(id: string): Promise<void> {
  if (isDemoMode()) return demoDb.deleteGalleryItem(id);

  const { error } = await db().from('gallery_items').delete().eq('id', id);
  if (error) throw new Error(`deleteGalleryItem: ${error.message}`);
}

/**
 * Upload an image to the public `gallery` bucket and return its CDN URL.
 * Object keys are `${category}/${YYYY-MM}/${uuid}.${ext}` so they cannot be enumerated
 * and never collide between simultaneous uploads.
 */
export async function uploadGalleryImage(
  file: File,
  category: ServiceCategory = 'hair',
  bucket: 'gallery' | 'services' = 'gallery'
): Promise<string> {
  if (isDemoMode()) {
    // Session-local preview only — nothing is persisted in demo mode.
    return URL.createObjectURL(file);
  }

  const ext = (file.name.split('.').pop() ?? 'webp').toLowerCase();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const path = `${category}/${month}/${crypto.randomUUID()}.${ext}`;

  const supabase = db();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, cacheControl: '31536000' });

  if (error) throw new Error(`uploadGalleryImage: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/* ------------------------------------------------------------- appointments */

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  if (isDemoMode()) return demoDb.getAppointmentsByDate(date);

  return unwrap(
    await db()
      .from('appointments')
      .select('*, service:services(id, title, category, duration_minutes, price_npr, discount_price_npr)')
      .eq('booking_date', date)
      .order('booking_time', { ascending: true }),
    'getAppointmentsByDate'
  ) as Appointment[];
}

export async function getAppointmentsInRange(
  from: string,
  to: string
): Promise<Appointment[]> {
  if (isDemoMode()) return demoDb.getAppointmentsInRange(from, to);

  return unwrap(
    await db()
      .from('appointments')
      .select('*, service:services(id, title, category)')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true }),
    'getAppointmentsInRange'
  ) as Appointment[];
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<Appointment> {
  if (isDemoMode()) return demoDb.updateAppointmentStatus(id, status);

  return unwrap(
    await db().from('appointments').update({ status }).eq('id', id).select().single(),
    'updateAppointmentStatus'
  ) as Appointment;
}

export async function createWalkInAppointment(input: {
  client_name: string;
  client_phone: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  total_amount_npr: number;
  assigned_staff_id?: string | null;
  notes?: string;
}): Promise<Appointment> {
  const payload = {
    ...input,
    notes: input.notes ?? null,
    status: 'in_progress' as AppointmentStatus,
    is_walk_in: true,
    assigned_staff_id: input.assigned_staff_id ?? null,
  };

  if (isDemoMode()) return demoDb.createAppointment(payload);

  return unwrap(
    await db().from('appointments').insert([payload]).select().single(),
    'createWalkInAppointment'
  ) as Appointment;
}

export async function getDailyKpis(date: string): Promise<DailyKpis> {
  if (isDemoMode()) return demoDb.getDailyKpis(date);

  const rows = unwrap(
    await db().from('appointments').select('status, total_amount_npr').eq('booking_date', date),
    'getDailyKpis'
  ) as Pick<Appointment, 'status' | 'total_amount_npr'>[];

  const count = (status: AppointmentStatus) => rows.filter((r) => r.status === status).length;

  return {
    total: rows.length,
    pending: count('pending'),
    confirmed: count('confirmed'),
    inProgress: count('in_progress'),
    completed: count('completed'),
    cancelled: count('cancelled'),
    projectedRevenue: rows
      .filter((r) => r.status !== 'cancelled')
      .reduce((sum, r) => sum + Number(r.total_amount_npr), 0),
    realisedRevenue: rows
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + Number(r.total_amount_npr), 0),
  };
}

/* ----------------------------------------------------------------- settings */

export async function getSalonSettings(): Promise<SalonSettings> {
  if (isDemoMode()) return demoDb.getSettings();

  return unwrap(
    await db().from('salon_settings').select('*').eq('id', 1).single(),
    'getSalonSettings'
  ) as SalonSettings;
}

export async function updateSalonSettings(patch: Partial<SalonSettings>): Promise<SalonSettings> {
  if (isDemoMode()) return demoDb.updateSettings(patch);

  return unwrap(
    await db().from('salon_settings').update(patch).eq('id', 1).select().single(),
    'updateSalonSettings'
  ) as SalonSettings;
}
