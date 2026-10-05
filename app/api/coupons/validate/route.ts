import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/supabase/config';
import { demoCommerceDb } from '@/lib/demo-commerce';
import type { CouponPreview } from '@/types/marketing.types';
import { clientIp } from '@/lib/security/client-ip';
import { createRateLimiter } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/coupons/validate — advisory coupon check for the checkout UI.
 *
 * The coupon table has no public RLS policy, so this runs server-side: the customer learns only
 * whether the code *they typed* is usable, never the list of codes.
 *
 * This is NOT the authority. `place_order()` re-validates and recomputes the discount at order
 * time, so a crafted response cannot buy a discount.
 */

/**
 * Generous, because a real shopper mistyping a code is expected behaviour — this guards against
 * someone enumerating codes, not against honest typos.
 */
const rateLimited = createRateLimiter({
  bucket: 'coupons',
  limit: Number(process.env.COUPON_RATE_LIMIT_PER_MIN ?? 20),
});

const invalid = (reason: string): CouponPreview => ({
  valid: false,
  reason,
  code: null,
  discount_type: null,
  discount_value: null,
  discount_npr: 0,
});

export async function POST(request: NextRequest) {
  if (await rateLimited(clientIp(request))) {
    return NextResponse.json<CouponPreview>(invalid('Too many attempts. Please wait a minute.'), {
      status: 429,
    });
  }

  let body: { code?: unknown; subtotal?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<CouponPreview>(invalid('Invalid request.'), { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().slice(0, 32) : '';
  const subtotal = Number(body.subtotal ?? 0);

  if (!code) {
    return NextResponse.json<CouponPreview>(invalid('Enter a code.'), { status: 200 });
  }
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return NextResponse.json<CouponPreview>(invalid('Add something to your cart first.'), {
      status: 200,
    });
  }

  /* ------------------------------------------------------------- demo mode */
  if (isDemoMode()) {
    return NextResponse.json<CouponPreview>(demoCommerceDb.previewCoupon(code, subtotal), {
      status: 200,
    });
  }

  /* ------------------------------------------------------------- live mode */
  try {
    // Prefer the service-role client (bypasses RLS); fall back to the request-scoped client.
    const supabase = createAdminClient() ?? (await createClient());
    const { data, error } = await supabase.rpc('preview_coupon', {
      p_code: code,
      p_subtotal: subtotal,
    });

    if (error) {
      console.error('[coupons/validate] preview_coupon failed:', error.message);
      return NextResponse.json<CouponPreview>(
        invalid('We could not check that code right now. Please try again.'),
        { status: 200 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return NextResponse.json<CouponPreview>(invalid('That code is not recognised.'), {
        status: 200,
      });
    }

    return NextResponse.json<CouponPreview>(
      {
        valid: Boolean(row.valid),
        reason: String(row.reason ?? ''),
        code: row.code ?? null,
        discount_type: row.discount_type ?? null,
        discount_value: row.discount_value === null ? null : Number(row.discount_value),
        discount_npr: Number(row.discount_npr ?? 0),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[coupons/validate] unexpected:', error);
    return NextResponse.json<CouponPreview>(
      invalid('We could not check that code right now. Please try again.'),
      { status: 200 }
    );
  }
}
