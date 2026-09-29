'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  deleteCategory,
  getProductCategories,
  getProducts,
  upsertCategory,
} from '@/lib/shop-admin-api';
import { cn } from '@/lib/utils';
import type { ProductCategory } from '@/types/commerce.types';

/** Local slug helper — slugify is not exported from lib/utils. */
function localSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  image_url: string;
  display_order: string;
  is_active: boolean;
}

type FieldErrors = Partial<Record<keyof CategoryForm | 'form', string>>;

function emptyForm(): CategoryForm {
  return { name: '', slug: '', description: '', image_url: '', display_order: '1', is_active: true };
}

function formFromCategory(category: ProductCategory | null): CategoryForm {
  if (!category) return emptyForm();
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    image_url: category.image_url ?? '',
    display_order: String(category.display_order),
    is_active: category.is_active,
  };
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(() => emptyForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cats, products] = await Promise.all([
        getProductCategories(true),
        getProducts({ includeInactive: true }),
      ]);
      setCategories(cats);
      const counts: Record<string, number> = {};
      for (const product of products) {
        if (!product.category_id) continue;
        counts[product.category_id] = (counts[product.category_id] ?? 0) + 1;
      }
      setProductCounts(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load categories.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const ordered = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)
      ),
    [categories]
  );

  function patch<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setSlugTouched(false);
    setFormErrors({});
    setFormOpen(true);
  }

  function openEdit(category: ProductCategory) {
    setEditing(category);
    setForm(formFromCategory(category));
    setSlugTouched(true);
    setFormErrors({});
    setFormOpen(true);
  }

  async function toggleActive(category: ProductCategory) {
    setBusyId(category.id);
    try {
      await upsertCategory({ ...category, is_active: !category.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the category.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const displayOrder = Number(form.display_order);
    const nextErrors: FieldErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required.';
    if (!form.slug.trim()) nextErrors.slug = 'Slug is required.';
    if (!Number.isFinite(displayOrder) || displayOrder < 0) {
      nextErrors.display_order = 'Display order must be 0 or more.';
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await upsertCategory({
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        display_order: displayOrder,
        is_active: form.is_active,
      });
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormErrors({ form: err instanceof Error ? err.message : 'Could not save this category.' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this category.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Shop</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Categories</h1>
          <p className="text-sm text-charcoal-soft">
            Control the order the shop shelves appear in and which ones are visible.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add category
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Catalogue categories</CardTitle>
          <CardDescription>{categories.length} categories</CardDescription>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Category</TH>
                  <TH>Description</TH>
                  <TH>Products</TH>
                  <TH>Active</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading categories…
                    </TD>
                  </TR>
                ) : ordered.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-sm text-charcoal-soft">
                      No categories yet. Use “Add category” to organise your shop.
                    </TD>
                  </TR>
                ) : (
                  ordered.map((category) => {
                    const busy = busyId === category.id;
                    return (
                      <TR key={category.id}>
                        <TD className="whitespace-nowrap text-charcoal-soft">{category.display_order}</TD>
                        <TD className="min-w-[180px]">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="max-w-[9rem] truncate font-medium text-charcoal sm:max-w-[14rem]"
                              title={category.name}
                            >
                              {category.name}
                            </span>
                            {!category.is_active ? (
                              <Badge className="shrink-0 bg-charcoal/10 text-charcoal-soft">Inactive</Badge>
                            ) : null}
                          </div>
                          <p className="max-w-[9rem] truncate text-xs text-charcoal-soft sm:max-w-[14rem]">
                            /{category.slug}
                          </p>
                        </TD>
                        <TD className="min-w-[220px] break-words text-charcoal-soft">
                          {category.description ?? '—'}
                        </TD>
                        <TD className="whitespace-nowrap text-charcoal-soft">
                          {productCounts[category.id] ?? 0}
                        </TD>
                        <TD>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={category.is_active}
                            aria-label={`${category.is_active ? 'Deactivate' : 'Activate'} ${category.name}`}
                            disabled={busy}
                            onClick={() => void toggleActive(category)}
                             className={cn(
                               "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                               category.is_active ? 'bg-success' : 'bg-charcoal/20'
                             )}
                          >
                            <span
                              className={cn(
                                'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                                category.is_active ? 'translate-x-5' : 'translate-x-0.5'
                              )}
                            />
                          </button>
                        </TD>
                        <TD>
                           <div className="flex flex-wrap items-center gap-1.5">
                             <Button
                               type="button"
                               size="sm"
                               variant="outline"
                               onClick={() => openEdit(category)}
                               aria-label={`Edit ${category.name}`}
                               className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                             >
                               <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                               <span className="hidden sm:inline">Edit</span>
                             </Button>
                             <Button
                               type="button"
                               size="sm"
                               variant="ghost"
                               className="h-10 w-10 px-0 text-danger hover:bg-danger/10 sm:h-8 sm:w-8"
                               onClick={() => {
                                 setDeleteTarget(category);
                                 setDeleteError(null);
                               }}
                               aria-label={`Delete ${category.name}`}
                             >
                               <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                             </Button>
                           </div>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="md"
        title={editing ? 'Edit category' : 'Add category'}
        description={
          editing
            ? 'Update the shelf details. Display order controls where it appears in the shop.'
            : 'Create a new shelf. The slug is derived from the name and can be edited.'
        }
      >
        <form onSubmit={saveCategory} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="category-name" error={formErrors.name ?? null}>
              <Input
                id="category-name"
                value={form.name}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name: value,
                    slug: !editing && !slugTouched ? localSlugify(value) : prev.slug,
                  }));
                }}
                placeholder="Skincare"
                aria-invalid={Boolean(formErrors.name)}
                autoComplete="off"
              />
            </Field>

            <Field label="Slug" htmlFor="category-slug" error={formErrors.slug ?? null}>
              <Input
                id="category-slug"
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  patch('slug', event.target.value);
                }}
                placeholder="skincare"
                aria-invalid={Boolean(formErrors.slug)}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="category-description">
            <Textarea
              id="category-description"
              rows={2}
              value={form.description}
              onChange={(event) => patch('description', event.target.value)}
              placeholder="Serums, moisturisers and cleansers for daily routines."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Display order"
              htmlFor="category-order"
              error={formErrors.display_order ?? null}
              hint="Lower numbers appear first."
            >
              <Input
                id="category-order"
                type="number"
                min={0}
                value={form.display_order}
                onChange={(event) => patch('display_order', event.target.value)}
                aria-invalid={Boolean(formErrors.display_order)}
              />
            </Field>

            <Field label="Image URL" htmlFor="category-image" hint="Optional shelf image.">
              <Input
                id="category-image"
                value={form.image_url}
                onChange={(event) => patch('image_url', event.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => patch('is_active', event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Show this category in the shop
          </label>

          {formErrors.form ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {formErrors.form}
            </p>
          ) : null}

          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete category"
        description={deleteTarget ? `Delete “${deleteTarget.name}”?` : undefined}
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Any products in this category are not deleted — they become <span className="font-medium">uncategorised</span>{' '}
            and will no longer appear under a shop shelf until you reassign them.
          </p>
          {deleteError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {deleteError}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-2 border-t border-charcoal/10 bg-white px-5 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              Keep category
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              loading={deleting}
              className="w-full sm:w-auto"
            >
              Delete category
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
