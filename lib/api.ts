/**
 * Server-side data access (Server Components, Route Handlers, metadata).
 *
 * Client-side admin access lives in `lib/api-client.ts` — do not import this module into a
 * client component, it depends on `next/headers` through the server Supabase client.
 *
 * Behaviour: when Supabase is not configured the functions serve the bundled demo store.
 * When it IS configured but a query fails, the failure is logged and an empty result is
 * returned so public pages degrade to their designed empty state instead of erroring.
 */
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoDb, demoHeroSlides } from '@/lib/demo-data';
import type {
  AcademyCourse,
  Appointment,
  AppointmentStatus,
  DailyKpis,
  GalleryItem,
  HeroSlide,
  SalonSettings,
  Service,
} from '@/types/database.types';

/**
 * Logs a read failure and returns `fallback`, keeping public pages renderable.
 *
 * Next.js signals "this route cannot be static" by throwing an error tagged
 * `DYNAMIC_SERVER_USAGE` the first time a page touches `cookies()`. That is not a failure —
 * it is an instruction. Swallowing it would leave the page statically prerendered with EMPTY
 * data (an academy page with no courses, settings falling back to defaults), so it is
 * re-thrown and Next marks the route dynamic instead.
 */
function degraded<T>(context: string, error: unknown, fallback: T): T {
  if (typeof error === 'object' && error !== null && 'digest' in error) {
    if ((error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE') throw error;
  }
  console.error(`[api] ${context} failed:`, error);
  return fallback;
}

/* ---------------------------------------------------------------- settings */

export async function getSalonSettings(): Promise<SalonSettings> {
  if (isDemoMode()) return demoDb.getSettings();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('salon_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    return degraded('getSalonSettings', error, demoDb.getSettings());
  }
}

/* ---------------------------------------------------------------- services */

export async function getActiveServices(): Promise<Service[]> {
  if (isDemoMode()) return demoDb.getServices();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded('getActiveServices', error, []);
  }
}

export async function getFeaturedServices(limit = 6): Promise<Service[]> {
  if (isDemoMode()) return demoDb.getFeaturedServices(limit);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded('getFeaturedServices', error, []);
  }
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  if (isDemoMode()) return demoDb.getServiceBySlug(slug);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    return degraded(`getServiceBySlug(${slug})`, error, null);
  }
}

/* ----------------------------------------------------------------- gallery */

export async function getGalleryItems(includeHidden = false): Promise<GalleryItem[]> {
  if (isDemoMode()) return demoDb.getGallery(includeHidden);

  try {
    const supabase = await createClient();
    let query = supabase.from('gallery_items').select('*');
    if (!includeHidden) query = query.eq('is_visible', true);

    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded('getGalleryItems', error, []);
  }
}

/* ----------------------------------------------------------------- courses */

export async function getAcademyCourses(): Promise<AcademyCourse[]> {
  if (isDemoMode()) return demoDb.getCourses();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('academy_courses')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded('getAcademyCourses', error, []);
  }
}

/* ------------------------------------------------------------ appointments */

/**
 * Live (non-cancelled) bookings for a date, used to compute slot availability.
 * Deliberately narrow — the public role cannot read appointment rows, so this is only
 * called from server-side code paths (route handlers) where the service-role client is used.
 */
export async function getBookedSlots(
  booking_date: string
): Promise<Pick<Appointment, 'booking_time' | 'status'>[]> {
  if (isDemoMode()) return demoDb.getBookedSlots(booking_date);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('appointments')
      .select('booking_time, status')
      .eq('booking_date', booking_date)
      .in('status', ['pending', 'confirmed', 'in_progress']);

    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    return degraded(`getBookedSlots(${booking_date})`, error, []);
  }
}

export async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  if (isDemoMode()) return demoDb.getAppointmentsByDate(date);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('appointments')
      .select('*, service:services(id, title, category, duration_minutes, price_npr, discount_price_npr)')
      .eq('booking_date', date)
      .order('booking_time', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Appointment[];
  } catch (error) {
    return degraded(`getAppointmentsByDate(${date})`, error, []);
  }
}

export async function getAppointmentsInRange(
  from: string,
  to: string
): Promise<Appointment[]> {
  if (isDemoMode()) return demoDb.getAppointmentsInRange(from, to);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('appointments')
      .select('*, service:services(id, title, category)')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Appointment[];
  } catch (error) {
    return degraded('getAppointmentsInRange', error, []);
  }
}

/** Aggregate KPIs for a single day (dashboard header strip). */
export async function getDailyKpis(date: string): Promise<DailyKpis> {
  const empty: DailyKpis = {
    total: 0,
    pending: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    projectedRevenue: 0,
    realisedRevenue: 0,
  };

  if (isDemoMode()) return demoDb.getDailyKpis(date);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('appointments')
      .select('status, total_amount_npr')
      .eq('booking_date', date);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
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
  } catch (error) {
    return degraded(`getDailyKpis(${date})`, error, empty);
  }
}

/**
 * Active hero slideshow images, in display order (migration 0014).
 *
 * The landing page falls back to `salon_settings.hero_image_url` when this is empty, and to the
 * bundled placeholder when neither is configured — so the hero is never blank.
 */
export async function getHeroSlides(): Promise<HeroSlide[]> {
  if (isDemoMode()) return demoHeroSlides();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as HeroSlide[];
  } catch (error) {
    return degraded('getHeroSlides', error, []);
  }
}
