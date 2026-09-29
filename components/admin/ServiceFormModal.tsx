'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { upsertService } from '@/lib/api-client';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/utils';
import type { Service, ServiceCategory } from '@/types/database.types';

interface FormState {
  title: string;
  slug: string;
  category: ServiceCategory;
  description: string;
  duration: string;
  price: string;
  discount: string;
  image_url: string;
  is_featured: boolean;
  is_active: boolean;
}

type FieldErrors = Partial<Record<keyof FormState | 'form', string>>;

/** Local slug helper — kept here so the modal has no extra dependency on lib/utils exports. */
function localSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function emptyForm(): FormState {
  return {
    title: '',
    slug: '',
    category: 'hair',
    description: '',
    duration: '60',
    price: '0',
    discount: '',
    image_url: '',
    is_featured: false,
    is_active: true,
  };
}

function formFromService(service: Service | null): FormState {
  if (!service) return emptyForm();
  return {
    title: service.title,
    slug: service.slug,
    category: service.category,
    description: service.description ?? '',
    duration: String(service.duration_minutes),
    price: String(service.price_npr),
    discount: service.discount_price_npr != null ? String(service.discount_price_npr) : '',
    image_url: service.image_url ?? '',
    is_featured: service.is_featured,
    is_active: service.is_active,
  };
}

export interface ServiceFormModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` = create a new service. */
  service: Service | null;
  onSaved: () => void;
}

export function ServiceFormModal({ open, onClose, service, onSaved }: ServiceFormModalProps) {
  const isEdit = Boolean(service);
  const [form, setForm] = useState<FormState>(() => formFromService(service));
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFromService(service));
    setSlugTouched(Boolean(service));
    setErrors({});
    setSaving(false);
  }, [open, service]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTitle(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      // Auto-derive the slug only while creating and before the user edits it.
      slug: !isEdit && !slugTouched ? localSlugify(value) : prev.slug,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const duration = Number(form.duration);
    const price = Number(form.price);
    const discount = form.discount.trim() === '' ? null : Number(form.discount);

    const nextErrors: FieldErrors = {};
    if (!form.title.trim()) nextErrors.title = 'Title is required.';
    if (!form.slug.trim()) nextErrors.slug = 'Slug is required.';
    if (!Number.isFinite(duration) || duration <= 0) {
      nextErrors.duration = 'Duration must be greater than 0.';
    }
    if (!Number.isFinite(price) || price < 0) nextErrors.price = 'Price must be 0 or more.';
    if (discount !== null) {
      if (!Number.isFinite(discount) || discount <= 0) {
        nextErrors.discount = 'Discount price must be greater than 0.';
      } else if (discount >= price) {
        nextErrors.discount = 'Discount price must be less than the base price.';
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await upsertService({
        ...(service ? { id: service.id } : {}),
        title: form.title.trim(),
        slug: form.slug.trim(),
        category: form.category,
        description: form.description.trim() || null,
        duration_minutes: duration,
        price_npr: price,
        discount_price_npr: discount,
        image_url: form.image_url.trim() || null,
        is_featured: form.is_featured,
        is_active: form.is_active,
      });
      onSaved();
      onClose();
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : 'Could not save this service.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit service' : 'Add service'}
      description={
        isEdit
          ? 'Update the catalogue entry. Leaving the promotion price blank removes any active promotion.'
          : 'Create a new catalogue entry. The slug is derived from the title and can be edited.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title" htmlFor="service-title" error={errors.title ?? null}>
          <Input
            id="service-title"
            value={form.title}
            onChange={(event) => handleTitle(event.target.value)}
            placeholder="Signature Hair Cut & Blow Dry"
            aria-invalid={Boolean(errors.title)}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Slug"
            htmlFor="service-slug"
            error={errors.slug ?? null}
            hint="Used in the public service URL."
          >
            <Input
              id="service-slug"
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                patch('slug', event.target.value);
              }}
              placeholder="signature-hair-cut-blow-dry"
              aria-invalid={Boolean(errors.slug)}
              autoComplete="off"
            />
          </Field>

          <Field label="Category" htmlFor="service-category">
            <Select
              id="service-category"
              value={form.category}
              onChange={(event) => patch('category', event.target.value as ServiceCategory)}
            >
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" htmlFor="service-description">
          <Textarea
            id="service-description"
            rows={3}
            value={form.description}
            onChange={(event) => patch('description', event.target.value)}
            placeholder="What the service includes."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duration (minutes)" htmlFor="service-duration" error={errors.duration ?? null}>
            <Input
              id="service-duration"
              type="number"
              min={1}
              step={5}
              value={form.duration}
              onChange={(event) => patch('duration', event.target.value)}
              aria-invalid={Boolean(errors.duration)}
            />
          </Field>

          <Field label="Base price (NPR)" htmlFor="service-price" error={errors.price ?? null}>
            <Input
              id="service-price"
              type="number"
              min={0}
              value={form.price}
              onChange={(event) => patch('price', event.target.value)}
              aria-invalid={Boolean(errors.price)}
            />
          </Field>

          <Field
            label="Promotion price (NPR)"
            htmlFor="service-discount"
            error={errors.discount ?? null}
            hint="Blank = no promotion."
          >
            <Input
              id="service-discount"
              type="number"
              min={0}
              value={form.discount}
              onChange={(event) => patch('discount', event.target.value)}
              aria-invalid={Boolean(errors.discount)}
              placeholder="No promotion"
            />
          </Field>
        </div>

        <Field
          label="Image URL"
          htmlFor="service-image"
          hint="Optional. Paste a public image URL (e.g. from the Media library)."
        >
          <Input
            id="service-image"
            value={form.image_url}
            onChange={(event) => patch('image_url', event.target.value)}
            placeholder="https://…"
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(event) => patch('is_featured', event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Feature on the public home page
          </label>

          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => patch('is_active', event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Active and bookable
          </label>
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
            {isEdit ? 'Save changes' : 'Create service'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
