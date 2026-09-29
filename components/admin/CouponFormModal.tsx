'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/label';
import { upsertCoupon } from '@/lib/marketing-api';
import {
  COUPON_DURATION_PRESETS,
  couponWindow,
  formatBsDate,
} from '@/lib/nepali-date';
import { formatNPR } from '@/lib/utils';
import type { Coupon, DiscountType } from '@/types/marketing.types';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

/**
 * Plain-English summary of what a customer gets, e.g. "20% off, up to रू 1,500 on orders
 * over रू 1,000". Exported so the coupons table and the modal agree on the wording.
 */
export function describeCouponOffer(input: {
  discount_type: DiscountType;
  discount_value: number;
  max_discount_npr: number | null;
  min_order_npr: number;
}): string {
  const value = Number(input.discount_value);
  const min = Number(input.min_order_npr);
  let base: string;

  if (!Number.isFinite(value) || value <= 0) {
    base = 'No discount yet';
  } else if (input.discount_type === 'percent') {
    base = `${value}% off`;
    const cap = Number(input.max_discount_npr);
    if (input.max_discount_npr != null && Number.isFinite(cap) && cap > 0) {
      base += `, up to ${formatNPR(cap)}`;
    }
  } else {
    base = `${formatNPR(value)} off`;
  }

  if (Number.isFinite(min) && min > 0) base += ` on orders over ${formatNPR(min)}`;
  return base;
}

/** `2026-10-01T10:00:00.000Z` → `2026-10-01T15:45` in the staff member's own timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Local `datetime-local` value → UTC ISO, or null when blank/invalid. */
function toISO(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface FormState {
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: string;
  min_order_npr: string;
  max_discount_npr: string;
  usage_limit: string;
  per_customer_limit: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

type FieldErrors = Partial<Record<keyof FormState | 'form', string>>;

/**
 * A new coupon starts with the owner's default validity window (`coupon_default_days` from
 * settings) already applied, so staff rarely need to touch the dates at all.
 */
function emptyForm(defaultDays?: number): FormState {
  const startsAt = defaultDays && defaultDays >= 1 ? couponWindow(defaultDays) : null;
  return {
    code: '',
    description: '',
    discount_type: 'percent',
    discount_value: '10',
    min_order_npr: '0',
    max_discount_npr: '',
    usage_limit: '',
    per_customer_limit: '1',
    starts_at: startsAt ? `${startsAt.starts_at}T00:00` : '',
    ends_at: startsAt?.ends_at ? `${startsAt.ends_at}T23:59` : '',
    is_active: true,
  };
}

function formFromCoupon(coupon: Coupon | null, defaultDays?: number): FormState {
  if (!coupon) return emptyForm(defaultDays);
  return {
    code: coupon.code,
    description: coupon.description ?? '',
    discount_type: coupon.discount_type,
    discount_value: String(coupon.discount_value),
    min_order_npr: String(coupon.min_order_npr),
    max_discount_npr: coupon.max_discount_npr != null ? String(coupon.max_discount_npr) : '',
    usage_limit: coupon.usage_limit != null ? String(coupon.usage_limit) : '',
    per_customer_limit: String(coupon.per_customer_limit),
    starts_at: toLocalInput(coupon.starts_at),
    ends_at: toLocalInput(coupon.ends_at),
    is_active: coupon.is_active,
  };
}

export interface CouponFormModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` = create a new coupon. */
  coupon: Coupon | null;
  /** Codes already in use, for a client-side uniqueness pre-check. */
  existingCodes: string[];
  /** `coupon_default_days` from settings — pre-fills a brand-new coupon's window. */
  defaultDays?: number;
  onSaved: (coupon: Coupon) => void;
}

export function CouponFormModal({
  open,
  onClose,
  coupon,
  existingCodes,
  defaultDays,
  onSaved,
}: CouponFormModalProps) {
  const isEdit = Boolean(coupon);

  const [form, setForm] = useState<FormState>(() => formFromCoupon(coupon, defaultDays));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog is (re)opened for a given coupon.
  useEffect(() => {
    if (!open) return;
    setForm(formFromCoupon(coupon, defaultDays));
    setErrors({});
    setSaving(false);
  }, [open, coupon, defaultDays]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Applies a quick validity window. `days = null` means the coupon never expires. Dates are
   * stored AD/UTC as always — only the picker and the BS labels are affected.
   */
  function applyWindow(days: number | null) {
    const start = form.starts_at ? form.starts_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const window = couponWindow(days, start);
    setErrors((prev) => ({ ...prev, ends_at: undefined }));
    setForm((prev) => ({
      ...prev,
      starts_at: `${window.starts_at}T00:00`,
      ends_at: window.ends_at ? `${window.ends_at}T23:59` : '',
    }));
  }

  const offerPreview = describeCouponOffer({
    discount_type: form.discount_type,
    discount_value: Number.isFinite(Number(form.discount_value)) ? Number(form.discount_value) : 0,
    max_discount_npr:
      form.discount_type === 'percent' && form.max_discount_npr.trim() !== ''
        ? Number(form.max_discount_npr)
        : null,
    min_order_npr: Number.isFinite(Number(form.min_order_npr)) ? Number(form.min_order_npr) : 0,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = form.code.trim().toUpperCase();
    const value = Number(form.discount_value);
    const minOrder = Number(form.min_order_npr);
    const maxDiscount = form.max_discount_npr.trim() === '' ? null : Number(form.max_discount_npr);
    const usageLimit = form.usage_limit.trim() === '' ? null : Number(form.usage_limit);
    const perCustomer = Number(form.per_customer_limit);
    const startsAt = toISO(form.starts_at);
    const endsAt = toISO(form.ends_at);
    const currentCode = (coupon?.code ?? '').toUpperCase();

    const nextErrors: FieldErrors = {};

    if (!code) {
      nextErrors.code = 'A coupon code is required.';
    } else if (!CODE_PATTERN.test(code)) {
      nextErrors.code = 'Use 3–32 characters: letters, numbers and dashes only.';
    } else if (existingCodes.some((known) => known.toUpperCase() === code && code !== currentCode)) {
      nextErrors.code = 'Another coupon already uses this code.';
    }

    if (!Number.isFinite(value) || value <= 0) {
      nextErrors.discount_value = 'The discount must be greater than 0.';
    } else if (form.discount_type === 'percent' && value > 100) {
      nextErrors.discount_value = 'A percentage cannot exceed 100%.';
    }

    if (form.discount_type === 'percent' && maxDiscount !== null) {
      if (!Number.isFinite(maxDiscount) || maxDiscount <= 0) {
        nextErrors.max_discount_npr = 'Enter a cap greater than 0, or leave it blank.';
      }
    }

    if (!Number.isFinite(minOrder) || minOrder < 0) {
      nextErrors.min_order_npr = 'Minimum order must be 0 or more.';
    }

    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      nextErrors.usage_limit = 'Enter a whole number of 1 or more, or leave it blank.';
    }

    if (!Number.isInteger(perCustomer) || perCustomer < 1) {
      nextErrors.per_customer_limit = 'Per-customer limit must be at least 1.';
    }

    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      nextErrors.ends_at = 'The end must be after the start.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const saved = await upsertCoupon({
        ...(coupon ? { id: coupon.id } : {}),
        code,
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: value,
        min_order_npr: minOrder,
        // A cap only makes sense on a percentage discount.
        max_discount_npr: form.discount_type === 'percent' ? maxDiscount : null,
        usage_limit: usageLimit,
        per_customer_limit: perCustomer,
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: form.is_active,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not save this coupon.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit coupon' : 'New coupon'}
      description={
        isEdit
          ? 'Changes apply the next time a customer checks out. Past orders keep the discount they were given.'
          : 'Create a code customers can type at checkout. The code is stored in capitals.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            htmlFor="coupon-code"
            error={errors.code ?? null}
            hint="Customers type this at checkout. Letters, numbers and dashes only."
          >
            <Input
              id="coupon-code"
              value={form.code}
              onChange={(event) => patch('code', event.target.value.toUpperCase())}
              placeholder="DASHAIN20"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono uppercase tracking-wide"
              aria-invalid={Boolean(errors.code)}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="coupon-description"
            hint="Internal note — customers do not see this."
          >
            <Input
              id="coupon-description"
              value={form.description}
              onChange={(event) => patch('description', event.target.value)}
              placeholder="Dashain festival offer"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="coupon-type">
            <Select
              id="coupon-type"
              value={form.discount_type}
              onChange={(event) => {
                const next = event.target.value as DiscountType;
                setForm((prev) => ({
                  ...prev,
                  discount_type: next,
                  // A fixed-amount coupon cannot carry a percentage cap.
                  max_discount_npr: next === 'fixed' ? '' : prev.max_discount_npr,
                }));
              }}
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </Select>
          </Field>

          <Field
            label={form.discount_type === 'percent' ? 'Percentage (%)' : 'Amount (NPR)'}
            htmlFor="coupon-value"
            error={errors.discount_value ?? null}
          >
            <Input
              id="coupon-value"
              type="number"
              min={0}
              step={form.discount_type === 'percent' ? 1 : 50}
              value={form.discount_value}
              onChange={(event) => patch('discount_value', event.target.value)}
              aria-invalid={Boolean(errors.discount_value)}
            />
          </Field>

          {form.discount_type === 'percent' ? (
            <Field
              label="Max discount (NPR)"
              htmlFor="coupon-max"
              error={errors.max_discount_npr ?? null}
              hint="Optional cap. Blank = no limit."
            >
              <Input
                id="coupon-max"
                type="number"
                min={0}
                value={form.max_discount_npr}
                onChange={(event) => patch('max_discount_npr', event.target.value)}
                placeholder="No cap"
                aria-invalid={Boolean(errors.max_discount_npr)}
              />
            </Field>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum order (NPR)"
            htmlFor="coupon-min"
            error={errors.min_order_npr ?? null}
            hint="0 = no minimum."
          >
            <Input
              id="coupon-min"
              type="number"
              min={0}
              value={form.min_order_npr}
              onChange={(event) => patch('min_order_npr', event.target.value)}
              aria-invalid={Boolean(errors.min_order_npr)}
            />
          </Field>

          <Field
            label="Usage limit"
            htmlFor="coupon-usage"
            error={errors.usage_limit ?? null}
            hint="Blank = unlimited redemptions."
          >
            <Input
              id="coupon-usage"
              type="number"
              min={1}
              value={form.usage_limit}
              onChange={(event) => patch('usage_limit', event.target.value)}
              placeholder="Unlimited"
              aria-invalid={Boolean(errors.usage_limit)}
            />
          </Field>

          <Field
            label="Per-customer limit"
            htmlFor="coupon-per-customer"
            error={errors.per_customer_limit ?? null}
            hint="How many times one phone number can use it."
          >
            <Input
              id="coupon-per-customer"
              type="number"
              min={1}
              value={form.per_customer_limit}
              onChange={(event) => patch('per_customer_limit', event.target.value)}
              aria-invalid={Boolean(errors.per_customer_limit)}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-charcoal">Quick validity</p>
          <div className="flex flex-wrap gap-2">
            {COUPON_DURATION_PRESETS.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyWindow(days)}
                aria-label={`Valid for ${days} days`}
                className="h-10 sm:h-8"
              >
                {days} days
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyWindow(null)}
              aria-label="No expiry"
              className="h-10 sm:h-8"
            >
              No expiry
            </Button>
          </div>
          <p className="text-xs text-charcoal-soft">
            Sets the start to today and the end the chosen number of days later. Stored as AD — the
            BS translation is shown beneath each field.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Field label="Starts" htmlFor="coupon-starts" hint="Blank = active immediately.">
              <Input
                id="coupon-starts"
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => patch('starts_at', event.target.value)}
              />
            </Field>
            {form.starts_at ? (
              <p className="text-xs text-charcoal-soft">{formatBsDate(form.starts_at, { withAd: true })}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Field
              label="Ends"
              htmlFor="coupon-ends"
              error={errors.ends_at ?? null}
              hint="Blank = runs until you switch it off."
            >
              <Input
                id="coupon-ends"
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => patch('ends_at', event.target.value)}
                aria-invalid={Boolean(errors.ends_at)}
              />
            </Field>
            {form.ends_at ? (
              <p className="text-xs text-charcoal-soft">{formatBsDate(form.ends_at, { withAd: true })}</p>
            ) : (
              <p className="text-xs text-charcoal-soft">No expiry</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => patch('is_active', event.target.checked)}
            className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
          />
          Active — customers can use this code
        </label>

        <div className="rounded-xl bg-cream-100 px-4 py-3">
          <p className="eyebrow">Customer sees</p>
          <p className="mt-1 text-sm font-medium text-charcoal">{offerPreview}</p>
        </div>

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
            {isEdit ? 'Save coupon' : 'Create coupon'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
