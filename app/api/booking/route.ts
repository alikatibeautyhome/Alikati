import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoDb } from '@/lib/demo-data';
import { createWhatsAppBookingLink } from '@/lib/whatsapp';
import { effectivePrice, isValidNepaliPhone, referenceCode } from '@/lib/utils';
import type { BookingResult } from '@/types/database.types';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/** One booking per customer is the norm; five a minute leaves room for a family booking together. */
const rateLimited = createRateLimiter({
  limit: Number(process.env.BOOKING_RATE_LIMIT_PER_MIN ?? 5),
});

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  if (rateLimited(ip)) {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'Too many requests. Please try again in a minute.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const client_name = String(body.client_name ?? '').trim();
  const client_phone = String(body.client_phone ?? '').trim();
  const service_id = String(body.service_id ?? '').trim();
  const booking_date = String(body.booking_date ?? '').trim();
  const booking_time = String(body.booking_time ?? '').trim().slice(0, 5);
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;

  /* -------------------------------------------------------------- validation */
  const fields: Record<string, string> = {};
  if (client_name.length < 2 || client_name.length > 100) {
    fields.client_name = 'Please enter your full name.';
  }
  if (!isValidNepaliPhone(client_phone)) {
    fields.client_phone = 'Enter a valid 10-digit Nepali mobile number.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) fields.booking_date = 'Select a valid date.';
  if (!/^\d{2}:\d{2}$/.test(booking_time)) fields.booking_time = 'Select a valid time slot.';
  if (!service_id) fields.service_id = 'Choose a service.';

  if (Object.keys(fields).length > 0) {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'Validation failed.', fields },
      { status: 422 }
    );
  }

  /* ------------------------------------------------------ demo-mode shortcut */
  // No Supabase project is configured, so the catalogue, settings and occupancy all come
  // from the bundled store. Nothing here may touch the network.
  if (isDemoMode()) {
    const service = demoDb.getServiceById(service_id);

    if (!service || !service.is_active) {
      return NextResponse.json<BookingResult>(
        { ok: false, error: 'That service is no longer available.' },
        { status: 404 }
      );
    }

    const clash = demoDb
      .getBookedSlots(booking_date)
      .some((slot) => slot.booking_time.slice(0, 5) === booking_time);

    if (clash) {
      return NextResponse.json<BookingResult>(
        { ok: false, error: 'That slot was just taken. Please pick another time.' },
        { status: 409 }
      );
    }

    const price = effectivePrice(service);
    const appointment = demoDb.createAppointment({
      client_name,
      client_phone,
      service_id,
      booking_date,
      booking_time,
      notes,
      status: 'pending',
      total_amount_npr: price,
      is_walk_in: false,
      service: { id: service.id, title: service.title, category: service.category },
    });

    const reference_code = referenceCode(appointment.id);

    return NextResponse.json<BookingResult>(
      {
        ok: true,
        appointment_id: appointment.id,
        reference_code,
        whatsapp_url: createWhatsAppBookingLink({
          client_name,
          client_phone,
          service_title: service.title,
          booking_date,
          booking_time,
          total_amount_npr: price,
          business_whatsapp: demoDb.getSettings().whatsapp_number,
          reference_code,
        }),
      },
      { status: 201 }
    );
  }

  /* ---------------------------------------------------- resolve service (live) */
  const supabase = await createClient();
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id, title, price_npr, discount_price_npr, is_active')
    .eq('id', service_id)
    .single();

  if (serviceError || !service || !service.is_active) {
    return NextResponse.json<BookingResult>(
      { ok: false, error: 'That service is no longer available.' },
      { status: 404 }
    );
  }

  const { data: settings } = await supabase
    .from('salon_settings')
    .select('whatsapp_number')
    .eq('id', 1)
    .single();

  const price = effectivePrice(service);
  const businessWhatsapp =
    settings?.whatsapp_number ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '9779800000000';

  /* --------------------------------------------------------- live-mode insert */
  const writer = createAdminClient() ?? supabase;

  const { data: appointment, error: insertError } = await writer
    .from('appointments')
    .insert([
      {
        client_name,
        client_phone,
        service_id,
        booking_date,
        booking_time,
        notes,
        status: 'pending',
        total_amount_npr: price,
        is_walk_in: false,
      },
    ])
    .select()
    .single();

  if (insertError) {
    // 23505 = the partial unique index on (booking_date, booking_time, service_id) fired,
    // i.e. another request won the race between our availability check and this insert.
    const clash = insertError.code === '23505';
    console.error('[api/booking] insert failed:', insertError.code, insertError.message);

    return NextResponse.json<BookingResult>(
      {
        ok: false,
        error: clash
          ? 'That slot was just taken. Please pick another time.'
          : 'We could not save your booking. Please call us directly.',
      },
      { status: 409 }
    );
  }

  const reference_code = referenceCode(appointment.id);

  return NextResponse.json<BookingResult>(
    {
      ok: true,
      appointment_id: appointment.id,
      reference_code,
      whatsapp_url: createWhatsAppBookingLink({
        client_name,
        client_phone,
        service_title: service.title,
        booking_date,
        booking_time,
        total_amount_npr: price,
        business_whatsapp: businessWhatsapp,
        reference_code,
      }),
    },
    { status: 201 }
  );
}
