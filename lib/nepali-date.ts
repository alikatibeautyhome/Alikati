/**
 * Bikram Sambat (Nepali) date helpers.
 *
 * The BS calendar is what customers and the salon actually read, so dates are shown in BS with
 * the AD equivalent alongside — stored dates remain AD/UTC in the database, which keeps sorting,
 * expiry comparisons and SQL arithmetic correct.
 *
 * Conversion is delegated to `nepali-date-converter`, whose table was spot-checked against
 * published reference pairs before use (BS epoch 1943-04-14 AD = 2000-01-01 BS, 2000-01-01 AD =
 * 2056-09-17 BS, Nepali New Year 2083 = 2026-04-14 AD).
 */
import NepaliDate from 'nepali-date-converter';

export const NEPALI_MONTHS_EN = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  // Month 6 of the BS calendar is Ashoj (असोज). "Ashwin" is the Hindu-calendar name for the
  // same period and is not what a Nepali business or customer would read.
  'Ashoj',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

export const NEPALI_MONTHS_NP = [
  'बैशाख',
  'जेठ',
  'असार',
  'साउन',
  'भदौ',
  'असोज',
  'कार्तिक',
  'मंसिर',
  'पुष',
  'माघ',
  'फाल्गुन',
  'चैत',
] as const;

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** `2083-06-12` → `२०८३-०६-१२` */
export function toDevanagari(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => DEVANAGARI_DIGITS[Number(digit)]);
}

export interface BsDate {
  year: number;
  /** 1-12 (Baisakh = 1). */
  month: number;
  day: number;
  monthNameEn: string;
  monthNameNp: string;
}

/**
 * The calendar day a value falls on **in Nepal**.
 *
 * This matters: `created_at` is a UTC timestamp, and 2026-09-28T20:00Z is already the 29th in
 * Kathmandu (UTC+5:45). Rendering the UTC day would date orders a day early for the salon.
 * Date-only strings are treated as Kathmandu noon so they can never slip a day.
 */
function kathmanduYmd(value: string | Date): { year: number; month: number; day: number } | null {
  let date: Date;
  if (typeof value === 'string') {
    const dateOnly = value.slice(0, 10);
    date = /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && value.length <= 10
      ? new Date(`${dateOnly}T12:00:00+05:45`)
      : new Date(value);
  } else {
    date = value;
  }
  if (Number.isNaN(date.getTime())) return null;

  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = formatted.split('-').map(Number);
  return { year, month, day };
}

/** Converts an ISO date (`YYYY-MM-DD`) or Date to Bikram Sambat. Null if unparseable. */
export function adToBs(value: string | Date | null | undefined): BsDate | null {
  if (!value) return null;
  try {
    const ymd = kathmanduYmd(value);
    if (!ymd) return null;
    // Anchor at noon UTC so no timezone shift can move the calendar day.
    const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));

    const bs = new NepaliDate(date);
    const year = bs.getYear();
    const month = bs.getMonth() + 1;
    const day = bs.getDate();

    return {
      year,
      month,
      day,
      monthNameEn: NEPALI_MONTHS_EN[month - 1] ?? '',
      monthNameNp: NEPALI_MONTHS_NP[month - 1] ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * BS → AD. Returns null if the BS date is out of the supported range.
 *
 * The library returns local midnight, which `toISOString()` renders as the *previous* day in any
 * timezone east of UTC — including the sandbox (UTC+8) and Kathmandu (UTC+5:45). Re-anchoring to
 * noon UTC keeps the calendar day stable wherever this runs.
 */
export function bsToAd(year: number, month: number, day: number): Date | null {
  try {
    const local = new NepaliDate(year, month - 1, day).toJsDate();
    return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), 12));
  } catch {
    return null;
  }
}

/**
 * Human-readable BS date.
 *
 *   formatBsDate('2026-09-28')                       → '12 Ashoj 2083'
 *   formatBsDate('2026-09-28', { script: 'np' })      → '१२ असोज २०८३'
 *   formatBsDate('2026-09-28', { withAd: true })      → '12 Ashoj 2083 (2026-09-28)'
 */
export function formatBsDate(
  value: string | Date | null | undefined,
  options: { script?: 'en' | 'np'; withAd?: boolean; short?: boolean } = {}
): string {
  const bs = adToBs(value);
  if (!bs) return '—';

  const { script = 'en', withAd = false, short = false } = options;
  const month = script === 'np' ? bs.monthNameNp : bs.monthNameEn;

  let text =
    script === 'np'
      ? `${toDevanagari(bs.day)} ${month} ${toDevanagari(bs.year)}`
      : short
        ? `${bs.day} ${month}`
        : `${bs.day} ${month} ${bs.year}`;

  if (withAd) {
    const ad = (typeof value === 'string' ? value : (value?.toISOString() ?? '')).slice(0, 10);
    text += ` (${ad})`;
  }
  return text;
}

/** `2083-06-12` — compact form for tables and inputs. */
export function formatBsIso(value: string | Date | null | undefined): string {
  const bs = adToBs(value);
  if (!bs) return '';
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

/* ───────────────────────────────────────────────────── coupons & expiry */

/** Quick-pick validity windows offered in the admin coupon form. */
export const COUPON_DURATION_PRESETS = [7, 10, 15, 30, 60, 90] as const;

/** Adds whole days to an ISO date and returns an ISO date. */
export function addDaysIso(value: string | Date, days: number): string {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a coupon validity window. `days = 7` means "valid for 7 days from the start date".
 * Pass `days = null` for a coupon that never expires.
 */
export function couponWindow(
  days: number | null,
  startsAtIso?: string
): { starts_at: string; ends_at: string | null } {
  const start = (startsAtIso ?? new Date().toISOString()).slice(0, 10);
  return {
    starts_at: start,
    ends_at: days === null ? null : addDaysIso(start, days),
  };
}

/** Days remaining until `endsAt`, or null when there is no expiry. Negative = already expired. */
export function daysUntil(endsAtIso: string | null | undefined): number | null {
  if (!endsAtIso) return null;
  const end = new Date(`${endsAtIso.slice(0, 10)}T23:59:59Z`).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / 86_400_000);
}

/** Short status label for a coupon's validity window, e.g. "Ends in 5 days". */
export function couponValidityLabel(
  startsAt: string | null,
  endsAt: string | null,
  isActive: boolean
): string {
  if (!isActive) return 'Paused';
  const now = Date.now();
  if (startsAt && new Date(`${startsAt.slice(0, 10)}T00:00:00Z`).getTime() > now) {
    return 'Scheduled';
  }
  const remaining = daysUntil(endsAt);
  if (remaining === null) return 'No expiry';
  if (remaining < 0) return 'Expired';
  if (remaining === 0) return 'Ends today';
  return `Ends in ${remaining} day${remaining === 1 ? '' : 's'}`;
}
