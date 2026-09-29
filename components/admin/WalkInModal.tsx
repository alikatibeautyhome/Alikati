'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { createWalkInAppointment, getServices } from '@/lib/api-client';
import { effectivePrice, formatDuration, isValidNepaliPhone, todayISO } from '@/lib/utils';
import type { Service } from '@/types/database.types';

type FieldErrors = Partial<Record<'client_name' | 'client_phone' | 'service_id' | 'date' | 'time' | 'amount' | 'form', string>>;

const OPEN_MINUTES = 7 * 60;
const CLOSE_MINUTES = 21 * 60;

/** 30-minute bookable slots offered by the walk-in form. */
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let mins = OPEN_MINUTES; mins <= CLOSE_MINUTES; mins += 30) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  }
  return slots;
})();

/** Current wall-clock time rounded up to the next 30-minute slot, clamped to business hours. */
function roundedUpSlot(): string {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(minutes / 30) * 30;
  const clamped = Math.min(Math.max(rounded, OPEN_MINUTES), CLOSE_MINUTES);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  /** Active services. When omitted (or empty) the modal fetches them itself. */
  services?: Service[];
  onCreated: () => void;
}

export function WalkInModal({ open, onClose, services, onCreated }: WalkInModalProps) {
  const [fetched, setFetched] = useState<Service[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(roundedUpSlot());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const options = services && services.length > 0 ? services : fetched;

  // Fetch the active catalogue when the caller did not supply it.
  useEffect(() => {
    if (!open || (services && services.length > 0)) return;
    let active = true;
    setLoadError(null);
    getServices(false)
      .then((rows) => {
        if (active) setFetched(rows);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Could not load services.');
      });
    return () => {
      active = false;
    };
  }, [open, services]);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setClientName('');
    setPhone('');
    setServiceId('');
    setDate(todayISO());
    setTime(roundedUpSlot());
    setAmount('');
    setNotes('');
    setAmountTouched(false);
    setErrors({});
    setSaving(false);
  }, [open]);

  function handleServiceChange(value: string) {
    setServiceId(value);
    const service = options.find((item) => item.id === value);
    if (service && !amountTouched) setAmount(String(effectivePrice(service)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amountValue = Number(amount);
    const nextErrors: FieldErrors = {};
    if (clientName.trim().length < 2) nextErrors.client_name = 'Enter the client name.';
    if (!isValidNepaliPhone(phone)) nextErrors.client_phone = 'Enter a valid 10-digit Nepali mobile number.';
    if (!serviceId) nextErrors.service_id = 'Choose a service.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) nextErrors.date = 'Select a date.';
    if (!/^\d{2}:\d{2}$/.test(time)) nextErrors.time = 'Select a time.';
    if (!Number.isFinite(amountValue) || amountValue < 0) nextErrors.amount = 'Enter a valid amount.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await createWalkInAppointment({
        client_name: clientName.trim(),
        client_phone: phone.trim(),
        service_id: serviceId,
        booking_date: date,
        booking_time: time,
        total_amount_npr: amountValue,
        notes: notes.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not create the walk-in booking.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Add walk-in"
      description="Books a client into today's queue immediately, marked as a walk-in and set to In Progress."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" htmlFor="walkin-name" error={errors.client_name ?? null}>
            <Input
              id="walkin-name"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Sita Joshi"
              aria-invalid={Boolean(errors.client_name)}
              autoComplete="off"
            />
          </Field>

          <Field label="Phone" htmlFor="walkin-phone" error={errors.client_phone ?? null}>
            <Input
              id="walkin-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="98XXXXXXXX"
              inputMode="tel"
              aria-invalid={Boolean(errors.client_phone)}
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Service" htmlFor="walkin-service" error={errors.service_id ?? loadError ?? null}>
          <Select
            id="walkin-service"
            value={serviceId}
            onChange={(event) => handleServiceChange(event.target.value)}
            aria-invalid={Boolean(errors.service_id)}
          >
            <option value="">Choose a service…</option>
            {options.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title} — {formatDuration(service.duration_minutes)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="walkin-date" error={errors.date ?? null}>
            <Input
              id="walkin-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={Boolean(errors.date)}
            />
          </Field>

          <Field label="Time" htmlFor="walkin-time" error={errors.time ?? null}>
            <Select
              id="walkin-time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              aria-invalid={Boolean(errors.time)}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Amount (NPR)"
            htmlFor="walkin-amount"
            error={errors.amount ?? null}
            hint="Pre-filled from the service; editable."
          >
            <Input
              id="walkin-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(event) => {
                setAmountTouched(true);
                setAmount(event.target.value);
              }}
              aria-invalid={Boolean(errors.amount)}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="walkin-notes" hint="Optional — allergies, preferences, who referred them.">
          <Textarea
            id="walkin-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
          />
        </Field>

        {errors.form ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {errors.form}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Add walk-in
          </Button>
        </div>
      </form>
    </Modal>
  );
}
