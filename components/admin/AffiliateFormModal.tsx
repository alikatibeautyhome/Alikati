'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { upsertAffiliate } from '@/lib/marketing-api';
import { isValidNepaliPhone } from '@/lib/utils';
import { SOCIAL_FIELDS, normalizeSocialAccounts } from '@/lib/socials';
import type { Affiliate, AffiliateStatus } from '@/types/marketing.types';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface FormState {
  name: string;
  phone: string;
  email: string;
  code: string;
  commission_rate: string;
  status: AffiliateStatus;
  notes: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
}

type FieldErrors = Partial<Record<keyof FormState | 'form', string>>;

export interface AffiliateFormModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` = add an affiliate by hand. */
  affiliate: Affiliate | null;
  /** Codes already in use, for a client-side uniqueness pre-check. */
  existingCodes: string[];
  /** Applied to the commission field when creating. */
  defaultRate: number;
  onSaved: (affiliate: Affiliate) => void;
}

function formFromAffiliate(affiliate: Affiliate | null, defaultRate: number): FormState {
  if (!affiliate) {
    return {
      name: '',
      phone: '',
      email: '',
      code: '',
      commission_rate: String(defaultRate),
      status: 'active',
      notes: '',
      facebook_url: '',
      instagram_url: '',
      tiktok_url: '',
    };
  }
  return {
    name: affiliate.name,
    phone: affiliate.phone,
    email: affiliate.email ?? '',
    code: affiliate.code,
    commission_rate: String(affiliate.commission_rate),
    status: affiliate.status,
    notes: affiliate.notes ?? '',
    facebook_url: affiliate.facebook_url ?? '',
    instagram_url: affiliate.instagram_url ?? '',
    tiktok_url: affiliate.tiktok_url ?? '',
  };
}

export function AffiliateFormModal({
  open,
  onClose,
  affiliate,
  existingCodes,
  defaultRate,
  onSaved,
}: AffiliateFormModalProps) {
  const isEdit = Boolean(affiliate);

  const [form, setForm] = useState<FormState>(() => formFromAffiliate(affiliate, defaultRate));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFromAffiliate(affiliate, defaultRate));
    setErrors({});
    setSaving(false);
  }, [open, affiliate, defaultRate]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = form.code.trim().toUpperCase();
    const rate = Number(form.commission_rate);
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const currentCode = (affiliate?.code ?? '').toUpperCase();

    const nextErrors: FieldErrors = {};

    if (!name) nextErrors.name = 'A name is required.';
    if (!phone) nextErrors.phone = 'A phone number is required.';
    else if (!isValidNepaliPhone(phone)) {
      nextErrors.phone = 'Enter a valid Nepali mobile number, e.g. 9800000000.';
    }
    if (!code) {
      nextErrors.code = 'A referral code is required.';
    } else if (!CODE_PATTERN.test(code)) {
      nextErrors.code = 'Use 3–32 characters: letters, numbers and dashes only.';
    } else if (existingCodes.some((known) => known.toUpperCase() === code && code !== currentCode)) {
      nextErrors.code = 'Another affiliate already uses this code.';
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
      nextErrors.commission_rate = 'Enter a rate between 0 and 50.';
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      nextErrors.email = 'Enter a valid email address, or leave it blank.';
    }

    // Any account that IS filled in must be usable. Staff may leave all three blank — unlike a
    // public application (which migration 0017 requires to carry one), a member added by hand is
    // a judgement call the salon is entitled to make.
    for (const field of SOCIAL_FIELDS) {
      const raw = form[field.key].trim();
      if (!raw) continue;
      const normalized = field.normalize(raw);
      if (!normalized || !field.isValid(normalized)) nextErrors[field.key] = field.invalidMessage;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const saved = await upsertAffiliate({
        ...(affiliate ? { id: affiliate.id } : {}),
        name,
        phone,
        email: email || null,
        code,
        commission_rate: rate,
        status: form.status,
        notes: form.notes.trim() || null,
        // Normalised on save, so "@nirmala.k" is stored as a full profile URL and a cleared box
        // becomes NULL rather than an empty string.
        ...normalizeSocialAccounts(form),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not save this affiliate.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit affiliate' : 'Add affiliate'}
      description={
        isEdit
          ? 'Update the contact details, referral code or commission rate. Status is changed from the list.'
          : 'Add someone to the programme by hand. Most affiliates arrive by applying on the public page.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="affiliate-name" error={errors.name ?? null}>
            <Input
              id="affiliate-name"
              value={form.name}
              onChange={(event) => patch('name', event.target.value)}
              placeholder="Nirmala Khadka"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <Field
            label="Phone"
            htmlFor="affiliate-phone"
            error={errors.phone ?? null}
            hint="Used for tap-to-call and WhatsApp."
          >
            <Input
              id="affiliate-phone"
              value={form.phone}
              onChange={(event) => patch('phone', event.target.value)}
              placeholder="9800000000"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="affiliate-email" error={errors.email ?? null} hint="Optional.">
            <Input
              id="affiliate-email"
              type="email"
              value={form.email}
              onChange={(event) => patch('email', event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>

          <Field
            label="Referral code"
            htmlFor="affiliate-code"
            error={errors.code ?? null}
            hint="Stored in capitals; used in the ?ref= link."
          >
            <Input
              id="affiliate-code"
              value={form.code}
              onChange={(event) => patch('code', event.target.value.toUpperCase())}
              placeholder="NIRMALA-K7"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono uppercase tracking-wide"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>
        </div>

        <fieldset className="space-y-4 rounded-xl border border-charcoal/10 bg-cream-100/60 p-4">
          <legend className="px-1 text-sm font-medium text-charcoal">Social accounts</legend>
          <p className="-mt-2 text-xs text-charcoal-soft">
            What the programme is reviewed on. A public application must supply at least one; here
            they are optional, and clearing a box removes the link.
          </p>

          {SOCIAL_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`affiliate-${field.key}`}
              hint={field.hint}
              error={errors[field.key] ?? null}
            >
              <Input
                id={`affiliate-${field.key}`}
                value={form[field.key]}
                onChange={(event) => patch(field.key, event.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors[field.key])}
              />
            </Field>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Commission rate (%)"
            htmlFor="affiliate-rate"
            error={errors.commission_rate ?? null}
            hint="Share of the order subtotal this affiliate earns."
          >
            <Input
              id="affiliate-rate"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={form.commission_rate}
              onChange={(event) => patch('commission_rate', event.target.value)}
              aria-invalid={Boolean(errors.commission_rate)}
            />
          </Field>

          <Field label="Status" htmlFor="affiliate-status" hint="Only active affiliates earn commission.">
            <Select
              id="affiliate-status"
              value={form.status}
              onChange={(event) => patch('status', event.target.value as AffiliateStatus)}
            >
              <option value="pending">Pending — applied, not approved</option>
              <option value="active">Active — code works and earns</option>
              <option value="suspended">Suspended — paused</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes" htmlFor="affiliate-notes" hint="Internal only — e.g. how you met them.">
          <Textarea
            id="affiliate-notes"
            rows={2}
            value={form.notes}
            onChange={(event) => patch('notes', event.target.value)}
            placeholder="Referred by a regular client at the salon."
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
            {isEdit ? 'Save changes' : 'Add affiliate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
