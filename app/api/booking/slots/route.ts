import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoDb } from '@/lib/demo-data';
import { getSalonSettings } from '@/lib/api';
import { generateTimeSlots } from '@/lib/utils';
import type { AppointmentStatus } from '@/types/database.types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/booking/slots?date=YYYY-MM-DD&duration=60
 *
 * Returns the bookable 30-minute intervals for a date. Availability must be computed
 * server-side because the public (anon) role deliberately has no SELECT policy on
 * `appointments` — a browser cannot read the booking table directly.
 *
 * `available: false` in the response means the server could not verify occupancy (no
 * service-role key configured), so the client should present the slots as provisional and
 * rely on the booking endpoint's clash check for the final word.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  const duration = Number(searchParams.get('duration') ?? 60);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required.' }, { status: 400 });
  }

  const settings = await getSalonSettings();

  let taken: Pick<{ booking_time: string; status: AppointmentStatus }, 'booking_time' | 'status'>[] = [];
  let verified = true;

  if (isDemoMode()) {
    taken = demoDb.getBookedSlots(date);
  } else {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('appointments')
        .select('booking_time, status')
        .eq('booking_date', date)
        .in('status', ['pending', 'confirmed', 'in_progress']);

      if (error) {
        console.error('[api/booking/slots] occupancy lookup failed:', error.message);
        verified = false;
      } else {
        taken = data ?? [];
      }
    } else {
      console.warn(
        '[api/booking/slots] SUPABASE_SERVICE_ROLE_KEY is not set — returning unverified availability.'
      );
      verified = false;
    }
  }

  const slots = generateTimeSlots(
    settings,
    taken,
    Number.isFinite(duration) && duration > 0 ? duration : 60
  );

  return NextResponse.json(
    { date, slots, available: verified },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
