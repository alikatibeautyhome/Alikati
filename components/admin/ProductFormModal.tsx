'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/label';
import { getProductCategories, upsertProduct } from '@/lib/shop-admin-api';
import { ProductImageUpload } from '@/components/admin/ProductImageUpload';
import type { Product, ProductCategory } from '@/types/commerce.types';

const SHORT_DESCRIPTION_MAX = 240;

/** Local slug helper — kept here so the modal has no extra dependency on lib/utils exports. */
function localSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** `"Rose, Coral ,Brick"` → `["Rose", "Coral", "Brick"]`. */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

interface FormState {
  name: string;
  slug: string;
  sku: string;
  category_id: string;
  brand: string;
  short_description: string;
  description: string;
  price_npr: string;
  discount_price_npr: string;
  cost_price_npr: string;
  stock_qty: string;
  low_stock_threshold: string;
  image_url: string;
  variant_label: string;
  variant_options: string;
  tags: string;
  is_active: boolean;
  is_featured: boolean;
  rating_average: string;
  rating_count: string;
}

type FieldErrors = Partial<Record<keyof FormState | 'form', string>>;

function emptyForm(): FormState {
  return {
    name: '',
    slug: '',
    sku: '',
    category_id: '',
    brand: '',
    short_description: '',
    description: '',
    price_npr: '0',
    discount_price_npr: '',
    cost_price_npr: '',
    stock_qty: '0',
    low_stock_threshold: '5',
    image_url: '',
    variant_label: '',
    variant_options: '',
    tags: '',
    is_active: true,
    is_featured: false,
    rating_average: '',
    rating_count: '',
  };
}

function formFromProduct(product: Product | null): FormState {
  if (!product) return emptyForm();
  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku ?? '',
    category_id: product.category_id ?? '',
    brand: product.brand ?? '',
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    price_npr: String(product.price_npr),
    discount_price_npr: product.discount_price_npr != null ? String(product.discount_price_npr) : '',
    cost_price_npr: product.cost_price_npr != null ? String(product.cost_price_npr) : '',
    stock_qty: String(product.stock_qty),
    low_stock_threshold: String(product.low_stock_threshold),
    image_url: product.image_url ?? '',
    variant_label: product.variant_label ?? '',
    variant_options: product.variant_options.join(', '),
    tags: product.tags.join(', '),
    is_active: product.is_active,
    is_featured: product.is_featured,
    rating_average: product.rating_average != null ? String(product.rating_average) : '',
    rating_count: product.rating_count != null ? String(product.rating_count) : '',
  };
}

export interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` = create a new product. */
  product: Product | null;
  /** Every SKU already in the catalogue, for a client-side uniqueness pre-check. */
  existingSkus: string[];
  /** Receives the saved, server-returned product so the parent can refresh. */
  onSaved: (product: Product) => void;
}

export function ProductFormModal({
  open,
  onClose,
  product,
  existingSkus,
  onSaved,
}: ProductFormModalProps) {
  const isEdit = Boolean(product);

  const [form, setForm] = useState<FormState>(() => formFromProduct(product));
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Reset the form whenever the modal is (re)opened for a given product.
  useEffect(() => {
    if (!open) return;
    setForm(formFromProduct(product));
    setSlugTouched(Boolean(product));
    setErrors({});
    setSaving(false);
  }, [open, product]);

  // Categories are only needed while the dialog is visible.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setCategoriesError(null);
    getProductCategories(true)
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch((err: unknown) => {
        if (active) {
          setCategoriesError(err instanceof Error ? err.message : 'Could not load categories.');
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleName(value: string) {
    setForm((prev) => ({
      ...prev,
      name: value,
      // Auto-derive the slug only while creating and before the user edits it.
      slug: !isEdit && !slugTouched ? localSlugify(value) : prev.slug,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const price = Number(form.price_npr);
    const discount = form.discount_price_npr.trim() === '' ? null : Number(form.discount_price_npr);
    const cost = form.cost_price_npr.trim() === '' ? null : Number(form.cost_price_npr);
    const stock = Number(form.stock_qty);
    const lowThreshold = Number(form.low_stock_threshold);
    // Blank rating average means "no rating yet"; blanks elsewhere fall back to 0.
    const ratingAverage = form.rating_average.trim() === '' ? null : Number(form.rating_average);
    const ratingCount = form.rating_count.trim() === '' ? 0 : Number(form.rating_count);
    const sku = form.sku.trim();
    const currentSku = (product?.sku ?? '').trim().toLowerCase();

    const nextErrors: FieldErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required.';
    if (!form.slug.trim()) nextErrors.slug = 'Slug is required.';
    if (!Number.isFinite(price) || price < 0) nextErrors.price_npr = 'Price must be 0 or more.';
    if (discount !== null) {
      if (!Number.isFinite(discount) || discount <= 0) {
        nextErrors.discount_price_npr = 'Discount price must be greater than 0.';
      } else if (discount >= price) {
        nextErrors.discount_price_npr = 'Discount price must be less than the base price.';
      }
    }
    if (!Number.isFinite(stock) || stock < 0) nextErrors.stock_qty = 'Stock must be 0 or more.';
    if (!Number.isFinite(lowThreshold) || lowThreshold < 0) {
      nextErrors.low_stock_threshold = 'Low-stock threshold must be 0 or more.';
    }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      nextErrors.cost_price_npr = 'Cost price must be 0 or more.';
    }
    if (sku.length > 0) {
      const taken = existingSkus.some(
        (known) => known.trim().toLowerCase() === sku.toLowerCase() && sku.toLowerCase() !== currentSku
      );
      if (taken) nextErrors.sku = 'Another product already uses this SKU.';
    }
    if (form.short_description.length > SHORT_DESCRIPTION_MAX) {
      nextErrors.short_description = `Keep it within ${SHORT_DESCRIPTION_MAX} characters.`;
    }
    if (ratingAverage !== null && (!Number.isFinite(ratingAverage) || ratingAverage < 0 || ratingAverage > 5)) {
      nextErrors.rating_average = 'Enter a rating between 0 and 5, or leave it blank.';
    }
    if (!Number.isInteger(ratingCount) || ratingCount < 0) {
      nextErrors.rating_count = 'Enter a whole number of 0 or more, or leave it blank.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const saved = await upsertProduct({
        ...(product ? { id: product.id } : {}),
        name: form.name.trim(),
        slug: form.slug.trim(),
        sku: sku.length > 0 ? sku : null,
        category_id: form.category_id || null,
        brand: form.brand.trim() || null,
        short_description: form.short_description.trim() || null,
        description: form.description.trim() || null,
        price_npr: price,
        discount_price_npr: discount,
        cost_price_npr: cost,
        stock_qty: stock,
        low_stock_threshold: lowThreshold,
        image_url: form.image_url.trim() || null,
        images: form.image_url.trim() ? [form.image_url.trim()] : [],
        variant_label: form.variant_label.trim() || null,
        variant_options: splitList(form.variant_options),
        tags: splitList(form.tags),
        is_active: form.is_active,
        is_featured: form.is_featured,
        rating_average: ratingAverage,
        rating_count: ratingCount,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not save this product.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit product' : 'Add product'}
      description={
        isEdit
          ? 'Update the catalogue entry. Leaving the promotion price blank removes any active discount.'
          : 'Create a new catalogue entry. The slug is derived from the name and can be edited.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="product-name" error={errors.name ?? null}>
            <Input
              id="product-name"
              value={form.name}
              onChange={(event) => handleName(event.target.value)}
              placeholder="Radiance Vitamin C Serum 30ml"
              aria-invalid={Boolean(errors.name)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="product-slug"
            error={errors.slug ?? null}
            hint="Used in the public product URL."
          >
            <Input
              id="product-slug"
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                patch('slug', event.target.value);
              }}
              placeholder="radiance-vitamin-c-serum-30ml"
              aria-invalid={Boolean(errors.slug)}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU" htmlFor="product-sku" error={errors.sku ?? null} hint="Optional. Must be unique.">
            <Input
              id="product-sku"
              value={form.sku}
              onChange={(event) => patch('sku', event.target.value)}
              placeholder="ABH-SK-001"
              aria-invalid={Boolean(errors.sku)}
              autoComplete="off"
            />
          </Field>

          <Field label="Category" htmlFor="product-category" error={categoriesError}>
            <Select
              id="product-category"
              value={form.category_id}
              onChange={(event) => patch('category_id', event.target.value)}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Brand" htmlFor="product-brand">
            <Input
              id="product-brand"
              value={form.brand}
              onChange={(event) => patch('brand', event.target.value)}
              placeholder="Alikati"
              autoComplete="off"
            />
          </Field>
        </div>

        <Field
          label="Short description"
          htmlFor="product-short"
          error={errors.short_description ?? null}
          hint={`${form.short_description.length}/${SHORT_DESCRIPTION_MAX} characters — shown on product cards.`}
        >
          <Input
            id="product-short"
            value={form.short_description}
            onChange={(event) => patch('short_description', event.target.value)}
            placeholder="10% stabilised vitamin C to brighten dull skin."
            aria-invalid={Boolean(errors.short_description)}
            maxLength={SHORT_DESCRIPTION_MAX + 20}
            autoComplete="off"
          />
        </Field>

        <Field label="Description" htmlFor="product-description">
          <Textarea
            id="product-description"
            rows={3}
            value={form.description}
            onChange={(event) => patch('description', event.target.value)}
            placeholder="Full product details, ingredients and usage."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (NPR)" htmlFor="product-price" error={errors.price_npr ?? null}>
            <Input
              id="product-price"
              type="number"
              min={0}
              value={form.price_npr}
              onChange={(event) => patch('price_npr', event.target.value)}
              aria-invalid={Boolean(errors.price_npr)}
            />
          </Field>

          <Field
            label="Discount price (NPR)"
            htmlFor="product-discount"
            error={errors.discount_price_npr ?? null}
            hint="Blank = no promotion."
          >
            <Input
              id="product-discount"
              type="number"
              min={0}
              value={form.discount_price_npr}
              onChange={(event) => patch('discount_price_npr', event.target.value)}
              aria-invalid={Boolean(errors.discount_price_npr)}
              placeholder="No promotion"
            />
          </Field>

          <Field
            label="Cost price (NPR)"
            htmlFor="product-cost"
            error={errors.cost_price_npr ?? null}
            hint="Used for margin reporting."
          >
            <Input
              id="product-cost"
              type="number"
              min={0}
              value={form.cost_price_npr}
              onChange={(event) => patch('cost_price_npr', event.target.value)}
              aria-invalid={Boolean(errors.cost_price_npr)}
              placeholder="Not recorded"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stock quantity" htmlFor="product-stock" error={errors.stock_qty ?? null}>
            <Input
              id="product-stock"
              type="number"
              min={0}
              value={form.stock_qty}
              onChange={(event) => patch('stock_qty', event.target.value)}
              aria-invalid={Boolean(errors.stock_qty)}
            />
          </Field>

          <Field
            label="Low-stock threshold"
            htmlFor="product-low"
            error={errors.low_stock_threshold ?? null}
            hint="Warn when stock drops to this level or less."
          >
            <Input
              id="product-low"
              type="number"
              min={0}
              value={form.low_stock_threshold}
              onChange={(event) => patch('low_stock_threshold', event.target.value)}
              aria-invalid={Boolean(errors.low_stock_threshold)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Variant label"
            htmlFor="product-variant-label"
            hint='Optional, e.g. "Shade" or "Size".'
          >
            <Input
              id="product-variant-label"
              value={form.variant_label}
              onChange={(event) => patch('variant_label', event.target.value)}
              placeholder="Shade"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Variant options"
            htmlFor="product-variant-options"
            hint="Comma-separated, e.g. Rosewood, Coral, Brick."
          >
            <Input
              id="product-variant-options"
              value={form.variant_options}
              onChange={(event) => patch('variant_options', event.target.value)}
              placeholder="Rosewood, Coral, Brick"
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Tags" htmlFor="product-tags" hint="Comma-separated, e.g. brightening, day use.">
          <Input
            id="product-tags"
            value={form.tags}
            onChange={(event) => patch('tags', event.target.value)}
            placeholder="brightening, day use"
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Rating average"
            htmlFor="product-rating-average"
            error={errors.rating_average ?? null}
            hint="Optional, 0–5. Leave blank when there are no real reviews — the storefront shows stars only when a rating exists."
          >
            <Input
              id="product-rating-average"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={form.rating_average}
              onChange={(event) => patch('rating_average', event.target.value)}
              placeholder="No rating"
              aria-invalid={Boolean(errors.rating_average)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Number of reviews"
            htmlFor="product-rating-count"
            error={errors.rating_count ?? null}
            hint="Optional whole number. Leave blank when there are no real reviews."
          >
            <Input
              id="product-rating-count"
              type="number"
              min={0}
              step={1}
              value={form.rating_count}
              onChange={(event) => patch('rating_count', event.target.value)}
              placeholder="0"
              aria-invalid={Boolean(errors.rating_count)}
              autoComplete="off"
            />
          </Field>
        </div>

        {/* Upload, preview and the paste-a-URL fallback live together in one section. */}
        <ProductImageUpload value={form.image_url} onChange={(url) => patch('image_url', url)} />

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => patch('is_active', event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Active in the shop
          </label>

          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(event) => patch('is_featured', event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Feature on the storefront
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
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
