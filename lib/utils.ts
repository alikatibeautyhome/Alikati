import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
  AppointmentStatus,
  LeadStatus,
  SalonSettings,
  Service,
  ServiceCategory,
} from '@/types/database.types';

/** Tailwind-aware class name merge used by every UI primitive. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------------------------------------------------------- currency */

/** `4500` → `रू 4,500` with Nepali/Indian digit grouping. */
export function formatNPR(amount: number): string {
  return `रू ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** `24500` → `रू 24.5k` — used in dense KPI tiles. */
export function formatNPRCompact(amount: number): string {
  const value = Number(amount);
  if (value >= 100000) return `रू ${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `रू ${(value / 1000).toFixed(1)}k`;
  return formatNPR(value);
}

/** The price actually charged: the discounted price when it is a real reduction. */
export function effectivePrice(
  service: Pick<Service, 'price_npr' | 'discount_price_npr'>
): number {
  const { price_npr, discount_price_npr } = service;
  return discount_price_npr != null && discount_price_npr < price_npr
    ? Number(discount_price_npr)
    : Number(price_npr);
}

/** Percentage saved, or `null` when there is no active promotion. */
export function discountPercent(
  service: Pick<Service, 'price_npr' | 'discount_price_npr'>
): number | null {
  const base = Number(service.price_npr);
  const now = Number(service.discount_price_npr);
  if (!service.discount_price_npr || now >= base || base <= 0) return null;
  return Math.round(((base - now) / base) * 100);
}

/* -------------------------------------------------------------------- time */

/** `'14:30'` → `'2:30 PM'`. */
export function to12Hour(time: string): string {
  const [hRaw, mRaw] = time.split(':');
  const h = Number(hRaw);
  const m = (mRaw ?? '00').padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m} ${suffix}`;
}

/** Local business date in Nepal (Asia/Kathmandu), as YYYY-MM-DD. */
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Add days to a YYYY-MM-DD string without timezone drift. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** `'2026-09-28'` → `'Sun, 28 Sep 2026'`, rendered in Kathmandu time. */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Minutes between two `HH:mm` values. */
export function minutesBetween(from: string, to: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return toMin(to) - toMin(from);
}

/**
 * 30-minute bookable intervals between opening and closing, excluding slots that overlap
 * a live appointment (using each appointment's duration), slots that would run past
 * closing, and — only when `bookingDate` is today in Nepal — slots already in the past.
 *
 * @param settings              salon opening/closing times (`HH:mm`)
 * @param dayAppointments       appointments already booked on the target date
 * @param serviceDurationMinutes duration of the service being booked
 * @param bookingDate           target date `YYYY-MM-DD`; omitted = today
 * @param reference             "now" — injectable for deterministic tests
 */
export function generateTimeSlots(
  settings: Pick<SalonSettings, 'opening_time' | 'closing_time'>,
  dayAppointments: (Pick<AppointmentLike, 'booking_time' | 'status'> & { duration_minutes?: number | null })[],
  serviceDurationMinutes = 60,
  bookingDate?: string,
  reference: Date = new Date()
): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toLabel = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const open = toMin(settings.opening_time);
  const close = toMin(settings.closing_time);

  const busy = dayAppointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'completed')
    .map((a) => {
      const start = toMin(a.booking_time.slice(0, 5));
      return { start, end: start + (a.duration_minutes && a.duration_minutes > 0 ? a.duration_minutes : 60) };
    });

  const today = todayISO(reference);
  const target = bookingDate ?? today;
  if (target < today) return [];

  let nowMinutes = -1;
  if (target === today) {
    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(reference);
    nowMinutes = toMin(nowParts);
  }

  const slots: string[] = [];
  for (let mins = open; mins + serviceDurationMinutes <= close; mins += 30) {
    if (mins <= nowMinutes) continue;
    const end = mins + serviceDurationMinutes;
    if (busy.some((b) => mins < b.end && end > b.start)) continue;
    slots.push(toLabel(mins));
  }
  return slots;
}

type AppointmentLike = { booking_time: string; status: AppointmentStatus };

/* ------------------------------------------------------------------ phones */

const NEPALI_MOBILE = /^(\+?977)?[- ]?9[6-8]\d{8}$/;

/** True for a valid Nepali mobile number, with or without +977 / spaces / dashes. */
export function isValidNepaliPhone(input: string): boolean {
  return NEPALI_MOBILE.test(input.trim());
}

/** Digits-only, country-code-first form used by wa.me deep links. */
export function normalizeWhatsAppNumber(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('977')) return digits;
  if (digits.startsWith('0')) return `977${digits.slice(1)}`;
  if (digits.length === 10) return `977${digits}`;
  return digits;
}

/** Display form: `9779800000000` → `+977 9800000000`. */
export function formatPhoneDisplay(input: string): string {
  const digits = normalizeWhatsAppNumber(input);
  if (digits.startsWith('977') && digits.length === 13) {
    return `+977 ${digits.slice(3)}`;
  }
  return input;
}

/* ------------------------------------------------------------- identifiers */

/** `ABH-9F3C21` reference code derived from an appointment UUID. */
export function referenceCode(id: string): string {
  return `ABH-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** URL-safe slug for services and courses. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function truncate(input: string, max = 120): string {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}

/* ------------------------------------------------------------------ labels */

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  hair: 'Hair',
  bridal: 'Bridal',
  nails: 'Nails',
  skin: 'Skin',
  packages: 'Packages',
};

export const CATEGORY_ORDER: ServiceCategory[] = [
  'hair',
  'bridal',
  'nails',
  'skin',
  'packages',
];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Tailwind classes for appointment status chips. */
export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-warn/10 text-warn ring-warn/25',
  confirmed: 'bg-success/10 text-success ring-success/25',
  in_progress: 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25',
  completed: 'bg-charcoal/10 text-charcoal ring-charcoal/20',
  cancelled: 'bg-danger/10 text-danger ring-danger/25',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  enrolled: 'Enrolled',
  archived: 'Archived',
};

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-warn/10 text-warn ring-warn/25',
  contacted: 'bg-rose-gold/10 text-rose-gold ring-rose-gold/25',
  enrolled: 'bg-success/10 text-success ring-success/25',
  archived: 'bg-charcoal/10 text-charcoal-soft ring-charcoal/20',
};

/** Next status options offered by the admin dispatch table, per current status. */
export const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {} as Record<
  AppointmentStatus,
  AppointmentStatus[]
>;
NEXT_STATUS.pending = ['confirmed', 'cancelled'];
NEXT_STATUS.confirmed = ['in_progress', 'completed', 'cancelled'];
NEXT_STATUS.in_progress = ['completed', 'cancelled'];
NEXT_STATUS.completed = [];
NEXT_STATUS.cancelled = [];

/** Duration in whole hours/minutes, e.g. `150` → `2 hr 30 min`. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
