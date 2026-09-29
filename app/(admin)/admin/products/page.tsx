'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { ProductFormModal } from '@/components/admin/ProductFormModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  adjustStock,
  deleteProduct,
  getProductCategories,
  getProducts,
  updateProduct,
} from '@/lib/shop-admin-api';
import {
  isLowStock,
  isOutOfStock,
  productDiscountPercent,
  productMarginPercent,
  productPrice,
  stockLabel,
} from '@/lib/commerce';
import { productImageSrc } from '@/lib/product-image';
import { cn, formatNPR } from '@/lib/utils';
import type { Product, ProductCategory } from '@/types/commerce.types';

type SortKey = 'newest' | 'name' | 'price-asc' | 'price-desc';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  name: 'Name (A–Z)',
  'price-asc': 'Price (low → high)',
  'price-desc': 'Price (high → low)',
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [includeInactive, setIncludeInactive] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, cats] = await Promise.all([
        getProducts({ includeInactive: true }),
        getProductCategories(true),
      ]);
      setProducts(rows);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products.');
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

  const setRowError = useCallback((id: string, message: string) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const run = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setBusyId(id);
      setRowError(id, '');
      try {
        await fn();
        await load();
      } catch (err) {
        setRowError(id, err instanceof Error ? err.message : 'Could not update this product.');
      } finally {
        setBusyId(null);
      }
    },
    [load, setRowError]
  );

  const categoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const summary = useMemo(() => {
    const active = products.filter((product) => product.is_active);
    return {
      total: products.length,
      low: active.filter((product) => isLowStock(product)).length,
      out: active.filter((product) => isOutOfStock(product)).length,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = products.filter((product) => {
      if (!includeInactive && !product.is_active) return false;
      if (categoryFilter !== 'all' && product.category_id !== categoryFilter) return false;
      if (!needle) return true;
      const haystack = `${product.name} ${product.sku ?? ''} ${product.brand ?? ''} ${product.tags.join(' ')}`.toLowerCase();
      return haystack.includes(needle);
    });

    return rows.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price-asc':
          return productPrice(a) - productPrice(b);
        case 'price-desc':
          return productPrice(b) - productPrice(a);
        default:
          return b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name);
      }
    });
  }, [products, search, categoryFilter, includeInactive, sort]);

  const existingSkus = useMemo(
    () => products.map((product) => product.sku).filter((sku): sku is string => Boolean(sku)),
    [products]
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormOpen(true);
  }

  function openAdjust(product: Product) {
    setAdjustId(product.id);
    setAdjustValue('12');
    setAdjustError(null);
  }

  async function applyAdjust(product: Product) {
    const delta = Number(adjustValue);
    if (adjustValue.trim() === '' || !Number.isFinite(delta) || delta === 0) {
      setAdjustError('Enter a non-zero number of units.');
      return;
    }
    setAdjustError(null);
    setBusyId(product.id);
    try {
      await adjustStock(product.id, delta);
      setAdjustId(null);
      await load();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Could not adjust the stock.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this product.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Shop</p>
          <h1 className="mt-1 font-display text-2xl text-charcoal">Product control centre</h1>
          <p className="text-sm text-charcoal-soft">
            Edit any field, toggle visibility, and restock or write off units — every change saves
            immediately.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add product
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Catalogue</CardTitle>
            <CardDescription>
              {summary.total} SKUs · {summary.low} low on stock · {summary.out} out of stock
            </CardDescription>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="products-search">
                Search
              </label>
              <Input
                id="products-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, SKU, brand or tag"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="products-category">
                Category
              </label>
              <Select
                id="products-category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-charcoal-soft" htmlFor="products-sort">
                Sort
              </label>
              <Select
                id="products-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-4 w-4 rounded border-charcoal/30 text-rose-gold focus-visible:ring-rose-gold"
            />
            Include inactive products
          </label>
        </CardHeader>

        <CardContent>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH>Price</TH>
                  <TH>Margin</TH>
                  <TH>Stock</TH>
                  <TH>Active</TH>
                  <TH>Featured</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-sm text-charcoal-soft">
                      Loading products…
                    </TD>
                  </TR>
                ) : products.length === 0 ? (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-sm text-charcoal-soft">
                      No products yet. Use “Add product” to build your catalogue.
                    </TD>
                  </TR>
                ) : filtered.length === 0 ? (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-sm text-charcoal-soft">
                      No products match these filters.
                    </TD>
                  </TR>
                ) : (
                  filtered.map((product) => {
                    const busy = busyId === product.id;
                    const percent = productDiscountPercent(product);
                    const margin = productMarginPercent(product);
                    const out = isOutOfStock(product);
                    const low = isLowStock(product);
                    const adjustOpen = adjustId === product.id;
                    return (
                      <Fragment key={product.id}>
                        <TR className="align-top">
                          <TD className="min-w-[220px]">
                            <div className="flex items-start gap-3">
                              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-[#ffffff]">
                                {product.image_url ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={productImageSrc(product.image_url)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </span>
                              <div className="min-w-0">
                                <p
                                  className="max-w-[10rem] truncate font-medium text-charcoal sm:max-w-[16rem]"
                                  title={product.name}
                                >
                                  {product.name}
                                </p>
                                <p className="max-w-[10rem] truncate text-xs text-charcoal-soft sm:max-w-[16rem]">
                                  {product.sku ? `${product.sku} · ` : ''}
                                  {product.brand ?? 'No brand'}
                                </p>
                                {!product.is_active ? (
                                  <Badge className="mt-1 bg-charcoal/10 text-charcoal-soft">Inactive</Badge>
                                ) : null}
                              </div>
                            </div>
                          </TD>
                          <TD className="text-charcoal-soft">
                            {product.category?.name ?? categoryName.get(product.category_id ?? '') ?? 'Uncategorised'}
                          </TD>
                          <TD className="whitespace-nowrap">
                            <span className="font-medium text-charcoal">{formatNPR(productPrice(product))}</span>
                            {percent != null ? (
                              <span className="ml-1 text-xs text-charcoal-soft">
                                <span className="line-through">{formatNPR(product.price_npr)}</span> −{percent}%
                              </span>
                            ) : null}
                          </TD>
                          <TD className="whitespace-nowrap text-charcoal-soft">
                            {margin != null ? `${margin}%` : '—'}
                          </TD>
                          <TD className="whitespace-nowrap">
                            <Badge
                              className={cn(
                                out
                                  ? 'bg-danger/10 text-danger ring-danger/25'
                                  : low
                                    ? 'bg-warn/10 text-warn ring-warn/25'
                                    : 'bg-success/10 text-success ring-success/25'
                              )}
                            >
                              {product.stock_qty} · {stockLabel(product)}
                            </Badge>
                             <div className="mt-1.5 flex flex-wrap items-center gap-1">
                               <Button
                                 type="button"
                                 size="sm"
                                 variant="outline"
                                 disabled={busy}
                                 onClick={() =>
                                   void run(product.id, () => adjustStock(product.id, -1))
                                 }
                                 aria-label={`Remove one unit of ${product.name}`}
                                 className="h-10 w-10 px-0 sm:h-8 sm:w-8"
                               >
                                 <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                               </Button>
                               <Button
                                 type="button"
                                 size="sm"
                                 variant="outline"
                                 disabled={busy}
                                 onClick={() => void run(product.id, () => adjustStock(product.id, 1))}
                                 aria-label={`Add one unit of ${product.name}`}
                                 className="h-10 w-10 px-0 sm:h-8 sm:w-8"
                               >
                                 <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                               </Button>
                               <Button
                                 type="button"
                                 size="sm"
                                 variant={adjustOpen ? 'default' : 'ghost'}
                                 disabled={busy}
                                 onClick={() => (adjustOpen ? setAdjustId(null) : openAdjust(product))}
                                 aria-expanded={adjustOpen}
                                 aria-label={`Adjust stock for ${product.name}`}
                                 className="h-10 min-w-10 sm:h-8 sm:min-w-0"
                               >
                                 Adjust
                               </Button>
                             </div>
                          </TD>
                          <TD>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={product.is_active}
                              aria-label={`${product.is_active ? 'Deactivate' : 'Activate'} ${product.name}`}
                              disabled={busy}
                              onClick={() =>
                                void run(product.id, () =>
                                  updateProduct(product.id, { is_active: !product.is_active })
                                )
                              }
                               className={cn(
                                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                                 product.is_active ? 'bg-success' : 'bg-charcoal/20'
                               )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                                  product.is_active ? 'translate-x-5' : 'translate-x-0.5'
                                )}
                              />
                            </button>
                          </TD>
                          <TD>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={product.is_featured}
                              aria-label={`${product.is_featured ? 'Unfeature' : 'Feature'} ${product.name}`}
                              disabled={busy}
                              onClick={() =>
                                void run(product.id, () =>
                                  updateProduct(product.id, { is_featured: !product.is_featured })
                                )
                              }
                               className={cn(
                                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline-none disabled:opacity-50",
                                 product.is_featured ? 'bg-rose-gold' : 'bg-charcoal/20'
                               )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform',
                                  product.is_featured ? 'translate-x-5' : 'translate-x-0.5'
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
                                 onClick={() => openEdit(product)}
                                 aria-label={`Edit ${product.name}`}
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
                                   setDeleteTarget(product);
                                   setDeleteError(null);
                                 }}
                                 aria-label={`Delete ${product.name}`}
                               >
                                 <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                               </Button>
                             </div>
                          </TD>
                        </TR>

                        {adjustOpen ? (
                          <TR>
                            <TD colSpan={8} className="bg-cream-100/70">
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="space-y-1.5">
                                  <label
                                    className="text-sm font-medium text-charcoal"
                                    htmlFor={`adjust-${product.id}`}
                                  >
                                    Stock adjustment for {product.name}
                                  </label>
                                  <Input
                                    id={`adjust-${product.id}`}
                                    type="number"
                                    step={1}
                                    value={adjustValue}
                                    onChange={(event) => setAdjustValue(event.target.value)}
                                    aria-invalid={Boolean(adjustError)}
                                    className="w-40"
                                    placeholder="e.g. 12"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void applyAdjust(product)}
                                  loading={busy}
                                >
                                  Apply
                                </Button>
                                <p className="text-xs text-charcoal-soft">
                                  The value is a change: <span className="font-medium">+12</span> books in
                                  received stock, a negative value such as{' '}
                                  <span className="font-medium">−2</span> writes off damaged units.
                                </p>
                              </div>
                              {adjustError ? (
                                <p role="alert" className="mt-2 text-xs font-medium text-danger">
                                  {adjustError}
                                </p>
                              ) : null}
                            </TD>
                          </TR>
                        ) : null}

                        {rowErrors[product.id] ? (
                          <TR>
                            <TD colSpan={8} className="pt-0">
                              <p role="alert" className="text-xs font-medium text-danger">
                                {rowErrors[product.id]}
                              </p>
                            </TD>
                          </TR>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editing}
        existingSkus={existingSkus}
        onSaved={() => void load()}
      />

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete product"
        description={
          deleteTarget ? `Delete “${deleteTarget.name}” from the catalogue?` : 'Delete this product?'
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-charcoal">
            Products that appear in past orders cannot be truly removed — deleting one leaves its
            order lines with no product link (<span className="font-medium">product_id</span> is set
            to null). To keep history intact, deactivate it instead by switching{' '}
            <span className="font-medium">is_active</span> off.
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
              Keep product
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              loading={deleting}
              className="w-full sm:w-auto"
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
