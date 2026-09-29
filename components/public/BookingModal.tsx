'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createWhatsAppBookingLink } from '@/lib/whatsapp';
import { formatBsDate } from '@/lib/nepali-date';
import {
  addDaysISO,
  cn,
  effectivePrice,
  formatDateLong,
  formatDuration,
  formatNPR,
  isValidNepaliPhone,
  to12Hour,
  todayISO,
} from '@/lib/utils';
import type { BookingResult, SalonSettings, Service } from '@/types/database.types';

interface SlotsResponse {
  date: string;
  slots: string[];
  available: boolean;
}

type Step = 1 | 2 | 3;

/**
 * Three-step booking engine: date & time → contact details → confirmation.
 *
 * Availability comes from `GET /api/booking/slots`; the booking itself is written by
 * `POST /api/booking`. When the API returns a `whatsapp_url` we link straight to it, otherwise we
 * rebuild an equivalent deep link in the browser.
 */
export function BookingModal({
  open,
  onClose,
  service,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  settings: SalonSettings;
}) {
  const [step, setStep] = useState<Step>(1);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [time, setTime] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState<BookingResult | null>(null);
  const [resultWhatsapp, setResultWhatsapp] = useState<string | null>(null);

  const minDate = todayISO();
  const maxDate = addDaysISO(minDate, 60);
  const duration = service?.duration_minutes ?? 60;

  const reset = useCallback(() => {
    setStep(1);
    setDate('');
    setSlots([]);
    setAvailable(true);
    setLoadingSlots(false);
    setSlotsError(null);
    setReloadKey(0);
    setTime('');
    setName('');
    setPhone('');
    setNotes('');
    setErrors({});
    setFormError(null);
    setSubmitting(false);
    setResult(null);
    setResultWhatsapp(null);
  }, []);

  // Start fresh whenever the modal opens (or a different service is selected).
  useEffect(() => {
    if (open) reset();
  }, [open, service?.id, reset]);

  // Load open slots for the chosen date.
  useEffect(() => {
    if (!open || !date) return;

    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);
    setTime('');

    fetch(`/api/booking/slots?date=${encodeURIComponent(date)}&duration=${duration}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load times for that date. Please try again.');
        return (await response.json()) as SlotsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSlots(Array.isArray(data.slots) ? data.slots : []);
        setAvailable(data.available !== false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSlots([]);
        setAvailable(true);
        setSlotsError(error instanceof Error ? error.message : 'Could not load times.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, date, duration, reloadKey]);

  const validateDetails = (): boolean => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.client_name = 'Please enter your full name.';
    if (!isValidNepaliPhone(phone)) next.client_phone = 'Enter a valid 10-digit Nepali mobile number.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!service) return;

    const svc = service;

    const buildFallbackLink = (payload: BookingResult): string =>
      createWhatsAppBookingLink({
        client_name: name.trim(),
        client_phone: phone.trim(),
        service_title: svc.title,
        booking_date: date,
        booking_time: time,
        total_amount_npr: effectivePrice(svc),
        business_whatsapp: settings.whatsapp_number,
        reference_code: payload.reference_code,
      });

    if (!validateDetails()) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: name.trim(),
          client_phone: phone.trim(),
          service_id: svc.id,
          booking_date: date,
          booking_time: time,
          notes: notes.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as BookingResult | null;

      if (response.status === 201 && data?.ok) {
        setResult(data);
        setResultWhatsapp(data.whatsapp_url ?? buildFallbackLink(data));
        setStep(3);
        return;
      }

      if (response.status === 422 && data?.fields) {
        setErrors(data.fields);
        setStep(2);
        return;
      }

      if (response.status === 409) {
        setFormError(data?.error ?? 'That slot was just taken. Please pick another time.');
        setStep(1);
        setTime('');
        setReloadKey((key) => key + 1);
        return;
      }

      if (response.status === 429) {
        setFormError(data?.error ?? 'Too many requests. Please wait a minute and try again.');
        return;
      }

      setFormError(data?.error ?? 'We could not complete your booking. Please call us directly.');
    } catch {
      setFormError('Network problem. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === 1 ? 'Book your appointment' : step === 2 ? 'Your details' : 'Booking requested';
  const description = service ? `${service.title} · ${formatNPR(effectivePrice(service))}` : undefined;

  return (
    <Modal open={open && service !== null} onClose={onClose} title={title} description={description} size="md">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-rose-gold">
        Step {step} of 3
      </p>

      {step === 1 && (
        <div className="space-y-5">
          <Field label="Choose a date" htmlFor="booking-date">
            <Input
              id="booking-date"
              type="date"
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          {!date ? (
            <p className="rounded-xl border border-charcoal/10 bg-cream-100 p-4 text-sm text-charcoal-soft">
              Pick a date and we will show you the open times.
            </p>
          ) : loadingSlots ? (
            <p className="text-sm text-charcoal-soft">Checking availability…</p>
          ) : slotsError ? (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {slotsError}
            </p>
          ) : slots.length === 0 ? (
            <div className="rounded-xl border border-charcoal/10 bg-cream-100 p-4 text-sm text-charcoal-soft">
              No open times on {formatDateLong(date)}. Please choose another date.
            </div>
          ) : (
            <div className="space-y-3">
              <div role="group" aria-label="Available time slots" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    aria-pressed={time === slot}
                    className={cn(
                      'rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
                      time === slot
                        ? 'border-rose-gold bg-rose-gold text-white'
                        : 'border-charcoal/15 bg-white text-charcoal hover:border-rose-gold/40'
                    )}
                  >
                    {to12Hour(slot)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-charcoal-soft">
                Times are 30-minute slots; this service takes {formatDuration(duration)}.
              </p>
            </div>
          )}

          {date && !loadingSlots && !slotsError && slots.length > 0 && !available && (
            <p className="rounded-xl bg-blush-50 p-3 text-xs text-charcoal-soft">
              Availability is provisional — we will confirm on WhatsApp.
            </p>
          )}

          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="button" disabled={!time} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl bg-cream-100 p-4 text-sm text-charcoal-soft">
            {service?.title}
            {date && time && (
              <>
                <br />
                {formatDateLong(date)} at {to12Hour(time)}
              </>
            )}
          </div>

          <Field label="Full name" htmlFor="booking-name" error={errors.client_name ?? null}>
            <Input
              id="booking-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(errors.client_name)}
              placeholder="e.g. Sita Joshi"
            />
          </Field>

          <Field
            label="Mobile number"
            htmlFor="booking-phone"
            error={errors.client_phone ?? null}
            hint="Nepali mobile, e.g. 98XXXXXXXX"
          >
            <Input
              id="booking-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={Boolean(errors.client_phone)}
              placeholder="98XXXXXXXX"
            />
          </Field>

          <Field label="Anything we should know? (optional)" htmlFor="booking-notes">
            <Textarea
              id="booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Allergies, preferred style, or who you are coming with…"
            />
          </Field>

          {formError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" loading={submitting} onClick={submit}>
              Request booking
            </Button>
          </div>
        </div>
      )}

      {step === 3 && service && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-display text-lg text-charcoal">Your slot is reserved</p>
              <p className="text-sm text-charcoal-soft">
                Please confirm on WhatsApp so we can lock it in. नमस्ते!
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-xl bg-cream-100 p-4 text-sm">
            {result?.reference_code && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-charcoal-soft">Reference</dt>
                <dd className="font-display text-base text-charcoal">{result.reference_code}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-charcoal-soft">Service</dt>
              <dd className="text-right font-medium text-charcoal">{service.title}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-charcoal-soft">Date</dt>
              <dd className="text-right text-charcoal">
                {settings.nepali_dates ? formatBsDate(date, { withAd: true }) : formatDateLong(date)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-charcoal-soft">Time</dt>
              <dd className="text-right text-charcoal">{to12Hour(time)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-charcoal-soft">Price</dt>
              <dd className="text-right font-medium text-price">
                {formatNPR(effectivePrice(service))}
              </dd>
            </div>
          </dl>

          <a
            href={resultWhatsapp ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-gold px-7 text-base font-medium text-white shadow-soft transition-colors hover:bg-rose-600"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Instant Confirm via WhatsApp
          </a>

          <Button type="button" variant="outline" className="w-full" onClick={reset}>
            Book another appointment
          </Button>
        </div>
      )}
    </Modal>
  );
}
