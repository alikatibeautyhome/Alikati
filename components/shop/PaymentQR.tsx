'use client';

import * as React from 'react';
import QRCode from 'qrcode';
import { AlertCircle, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaymentQRProps {
  /** Whether the owner wants a QR on the payment screen. */
  enabled: boolean;
  /**
   * What the QR should encode, e.g. `esewa:9869512756?amount={amount}`. Any `{amount}` token is
   * replaced with the live order total, so the code changes as the cart changes.
   */
  content?: string | null;
  /** The owner's own QR image (exported from the eSewa/Khalti app). Wins over `content`. */
  imageUrl?: string | null;
  /** Instruction shown under the code. */
  note?: string | null;
  /** Order total. Substituted into `{amount}` and always printed beside the code. */
  amount?: number | null;
  /** Currency label for the printed amount. */
  currencyLabel?: string;
  className?: string;
}

/**
 * Payment QR shown at checkout.
 *
 * Two modes:
 *   • **Uploaded image** — the salon exports its own receive-QR from the payment app and uploads
 *     it in admin settings. Always preferred, because it encodes whatever the provider expects.
 *   • **Generated** — falls back to encoding `payment_qr_content` (e.g. an eSewa ID) as a QR.
 *
 * Generation happens in the browser, so no request leaves the device and it works in demo mode.
 */
export function PaymentQR({
  enabled,
  content,
  imageUrl,
  note,
  amount,
  currencyLabel = 'रू',
  className,
}: PaymentQRProps) {
  const [generated, setGenerated] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    setGenerated(null);

    // `{amount}` lets the code carry the live order total, so it re-draws whenever the cart
    // changes. Wallets only pre-fill the amount if their QR format supports it — which is why
    // the total is also printed beside the code below.
    const template = (content ?? '').trim();
    const withAmount = template.replace(
      /\{amount\}/g,
      amount !== null && amount !== undefined && Number.isFinite(amount)
        ? String(Math.round(amount))
        : ''
    );
    const source = (imageUrl ?? '').trim() || withAmount;
    // Nothing to render when the owner disabled the QR, or supplied neither an image nor text.
    if (!enabled || !source) return;
    // An uploaded image is used directly — no need to encode anything.
    if ((imageUrl ?? '').trim()) return;

    QRCode.toDataURL(source, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#2A1B15', light: '#FFFFFF' },
    })
      .then((dataUrl) => {
        if (!cancelled) setGenerated(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError('Could not draw the QR code. Please pay using the details above.');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, content, imageUrl, amount]);

  if (!enabled) return null;

  const uploaded = (imageUrl ?? '').trim();
  const src: string | null = uploaded || generated;

  // Nothing configured at all — the owner has not set a QR up.
  if (!src && !error && !content && !uploaded) return null;

  if (!src && !error) {
    return (
      <div className={cn('flex h-[240px] w-[240px] items-center justify-center rounded-xl bg-cream-100', className)}>
        <span className="text-xs text-charcoal-soft">Preparing QR…</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-charcoal">
        <Smartphone className="h-4 w-4 text-rose-gold" aria-hidden="true" />
        Pay by QR
      </div>

      {error || !src ? (
        <p className="flex items-start gap-2 rounded-xl bg-blush-100 p-3 text-xs text-charcoal-soft">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          {error ?? 'QR code unavailable — please use the payment details shown above.'}
        </p>
      ) : (
        <div className="inline-block rounded-2xl border border-charcoal/10 bg-white p-3 shadow-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL or owner-uploaded PNG,
              neither of which benefits from the image optimiser. */}
          <img
            src={src}
            alt="Payment QR code — scan with your mobile banking or wallet app"
            width={240}
            height={240}
            className="h-[200px] w-[200px] object-contain sm:h-[240px] sm:w-[240px]"
          />
        </div>
      )}

      {amount !== null && amount !== undefined && Number.isFinite(amount) && (
        <p className="text-sm font-semibold text-charcoal">
          Amount to pay: {currencyLabel} {amount.toLocaleString('en-IN')}
        </p>
      )}

      {note && <p className="max-w-sm text-xs leading-relaxed text-charcoal-soft">{note}</p>}
    </div>
  );
}
