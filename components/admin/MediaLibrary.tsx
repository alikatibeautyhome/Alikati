'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, FolderPlus, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { deleteMediaObject, uploadMediaAsset } from '@/lib/api-client';
import {
  createMediaCategory,
  deleteMediaAsset,
  deleteMediaCategory,
  getMediaAssets,
  getMediaCategories,
  recordMediaAsset,
} from '@/lib/media-api';
import { cn } from '@/lib/utils';
import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, type MediaAsset, type MediaCategory } from '@/types/media.types';

/**
 * The admin media library.
 *
 * Editorial assets only — product photos, banners, logos, gallery pictures. Payment QRs are kept
 * out of it on purpose: they are configuration the checkout depends on, and a grid with a delete
 * button is the wrong place for something whose removal breaks payments. They live under
 * `payment-qr/` and are managed from the payment card.
 *
 * Files go to the public `gallery` bucket under `{category_slug}/`, so the library's folders and the
 * bucket's folders are the same thing and an asset can always be traced to its category. The tables
 * record what exists; the bytes stay in Storage.
 */

/** The gallery bucket's public prefix, used to recover the object path from the URL we just made. */
const PUBLIC_GALLERY_PREFIX = '/storage/v1/object/public/gallery/';

export function MediaLibrary() {
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [cats, items] = await Promise.all([getMediaCategories(), getMediaAssets()]);
      setCategories(cats);
      setAssets(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** The category new uploads are filed under. `all` is a filter, not a destination. */
  const targetCategory = categories.find((category) => category.id === activeCategory) ?? null;
  const visible = targetCategory ? assets.filter((asset) => asset.category_id === targetCategory.id) : assets;

  async function accept(files: File[]) {
    if (!targetCategory) {
      setError('Choose a category first — uploads are filed under one.');
      return;
    }

    const rejected: string[] = [];
    const usable = files.filter((file) => {
      if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        rejected.push(`${file.name} (not PNG, JPG, WebP or AVIF)`);
        return false;
      }
      if (file.size > MEDIA_MAX_BYTES) {
        rejected.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB, limit 8 MB)`);
        return false;
      }
      return true;
    });

    if (usable.length === 0) {
      setError(rejected.length ? `Could not use: ${rejected.join(', ')}.` : 'No files selected.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: usable.length });

    const failed: string[] = [];
    let added = 0;

    // Sequential rather than a burst: the caller sees per-file progress and a slow connection does
    // not time out a dozen parallel uploads at once.
    for (const [index, file] of usable.entries()) {
      try {
        const url = await uploadMediaAsset(file, targetCategory.slug);
        // The path is recovered from the URL our own uploader just built, so the inverse is exact.
        const path = url.includes(PUBLIC_GALLERY_PREFIX)
          ? url.split(PUBLIC_GALLERY_PREFIX)[1]
          : `${targetCategory.slug}/${file.name}`;

        await recordMediaAsset({
          categoryId: targetCategory.id,
          path,
          url,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        added += 1;
      } catch (err) {
        failed.push(`${file.name}${err instanceof Error ? ` (${err.message})` : ''}`);
      }
      setProgress({ done: index + 1, total: usable.length });
    }

    await load();
    setProgress({ done: 0, total: 0 });
    setBusy(false);
    if (added) setNotice(`${added} ${added === 1 ? 'file' : 'files'} added to ${targetCategory.name}.`);
    if (failed.length) setError(`Could not upload: ${failed.join(', ')}.`);
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createMediaCategory(name);
      setNewCategory('');
      await load();
      setActiveCategory(created.id);
      setNotice(`Category "${created.name}" created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that category.');
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: MediaCategory) {
    setBusy(true);
    setError(null);
    try {
      await deleteMediaCategory(category.id);
      if (activeCategory === category.id) setActiveCategory('all');
      await load();
      setNotice(`Category "${category.name}" removed. Its images are still in the library.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that category.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(asset: MediaAsset) {
    setBusy(true);
    setError(null);
    try {
      await deleteMediaAsset(asset.id);
      await deleteMediaObject(asset.path);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          aria-current={activeCategory === 'all'}
          className={cn(
            'min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors',
            activeCategory === 'all'
              ? 'border-rose-gold bg-rose-gold text-white'
              : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
          )}
        >
          All files
        </button>

        {categories.map((category) => (
          <span key={category.id} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setActiveCategory(category.id)}
              aria-current={activeCategory === category.id}
              className={cn(
                'min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors',
                category.is_system ? '' : 'pr-9',
                activeCategory === category.id
                  ? 'border-rose-gold bg-rose-gold text-white'
                  : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
              )}
            >
              {category.name}
            </button>
            {/* Seeded categories are refused by a database trigger, so no delete control is offered. */}
            {!category.is_system ? (
              <button
                type="button"
                onClick={() => void removeCategory(category)}
                disabled={busy}
                aria-label={`Delete category ${category.name}`}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-charcoal-soft transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
      </div>

      {/* ── New category ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-charcoal/10 bg-cream-100/60 p-4">
        <Field
          label="Add a category"
          htmlFor="media-new-category"
          hint="The folder name is derived from it automatically."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="media-new-category"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void addCategory();
                }
              }}
              placeholder="e.g. Seasonal Offers"
              autoComplete="off"
              className="min-w-[180px] flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void addCategory()} disabled={busy || !newCategory.trim()}>
              <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </Button>
          </div>
        </Field>
      </div>

      {/* ── Dropzone ─────────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Upload media files"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!busy) inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (!busy && files.length) void accept(files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-8 text-center transition-colors',
          dragging && 'border-rose-gold bg-blush-50',
          busy && 'cursor-not-allowed opacity-60'
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-rose-gold" aria-hidden="true" />
        ) : (
          <ImagePlus className="h-6 w-6 text-rose-gold" aria-hidden="true" />
        )}
        <p className="text-sm font-medium text-charcoal">
          {busy
            ? `Uploading ${progress.done} of ${progress.total}…`
            : targetCategory
              ? `Drag & drop files to add to “${targetCategory.name}”`
              : 'Choose a category, then drag & drop files here'}
        </p>
        <p className="text-xs text-charcoal-soft">
          or click to choose several at once · PNG, JPG, WebP, AVIF · max 8 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={MEDIA_ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) void accept(files);
          }}
        />
      </div>

      {notice ? (
        <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-charcoal-soft">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading the library…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-charcoal/15 bg-cream-100/60 px-4 py-10 text-center text-sm text-charcoal-soft">
          Nothing here yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((asset) => {
            const category = categories.find((item) => item.id === asset.category_id);
            return (
              <li key={asset.id} className="overflow-hidden rounded-2xl border border-charcoal/10 bg-white">
                <div className="relative aspect-square w-full bg-[#ffffff]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.filename} className="h-full w-full object-contain p-2" />
                </div>
                <div className="space-y-2 border-t border-charcoal/10 p-3">
                  <p className="truncate text-xs font-medium text-charcoal" title={asset.filename}>
                    {asset.filename}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {category ? (
                      <span className="rounded-full bg-charcoal/5 px-2 py-0.5 text-[10px] font-medium text-charcoal-soft">
                        {category.name}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-charcoal-soft">
                      {new Date(asset.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyUrlButton url={asset.url} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeAsset(asset)}
                      disabled={busy}
                      aria-label={`Delete ${asset.filename}`}
                      className="text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Copies the asset URL, which is what the field it will be pasted into actually needs. */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          return;
        }
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      }}
      className={cn('flex-1', copied && 'border-success/30 text-success')}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy URL'}
    </Button>
  );
}
