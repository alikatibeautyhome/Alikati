'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { uploadProductImage } from '@/lib/shop-admin-api';
import { cn } from '@/lib/utils';

/**
 * The product-image section of the admin product form: an ordered gallery, not a single field.
 *
 * **Index 0 is the primary image.** The form writes `images[0]` into `image_url`, which is what the
 * card, the share preview and the order confirmation all use, so there is exactly one source of
 * truth: to promote a photo you move it to the front. Keeping a separate "primary" flag would allow
 * the two columns to disagree.
 *
 * Every upload goes to the public `products` bucket through `uploadProductImage`, which returns a CDN
 * URL. Type and size are checked before the request, mirroring the bucket's own configuration, so a
 * rejected file costs no upload and reports which file was at fault.
 *
 * Multiple files are uploaded in sequence rather than in parallel: a burst of simultaneous uploads
 * on a shop's connection is slower in aggregate and makes per-file feedback impossible.
 */

/** Mirrors the `products` bucket exactly: no other MIME type is accepted server-side. */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
const ACCEPT = ALLOWED_TYPES.join(',');
const MAX_BYTES = 8 * 1024 * 1024;

export function ProductImagesUpload({
  images,
  onChange,
  disabled = false,
}: {
  /** Ordered gallery. Index 0 is the primary image. */
  images: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');

  const accept = useCallback(
    async (files: File[]) => {
      const rejected: string[] = [];
      const usable = files.filter((file) => {
        if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
          rejected.push(`${file.name} (not a PNG, JPG, WEBP or AVIF)`);
          return false;
        }
        if (file.size > MAX_BYTES) {
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
      setProgress({ done: 0, total: usable.length });

      const added: string[] = [];
      const failed: string[] = [];

      for (const [index, file] of usable.entries()) {
        try {
          added.push(await uploadProductImage(file));
        } catch (err) {
          failed.push(`${file.name}${err instanceof Error ? ` (${err.message})` : ''}`);
        }
        setProgress({ done: index + 1, total: usable.length });
      }

      // One write for the whole batch, so a part-failed batch still keeps what did upload.
      if (added.length > 0) onChange([...images, ...added]);

      if (failed.length || rejected.length) {
        setError(`Could not add: ${[...rejected, ...failed].join(', ')}.`);
      }
      setProgress({ done: 0, total: 0 });
      setBusy(false);
    },
    [images, onChange]
  );

  /** Promotion is a move to the front, because index 0 *is* the primary image. */
  const makePrimary = (index: number) => {
    if (index === 0) return;
    const next = [...images];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(images.filter((_, i) => i !== index));

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError('Paste a full URL starting with http:// or https://');
      return;
    }
    if (images.includes(url)) {
      setError('That image is already in the gallery.');
      return;
    }
    onChange([...images, url]);
    setUrlDraft('');
    setError(null);
  };

  const blocked = disabled || busy;

  return (
    <section className="space-y-4 rounded-2xl border border-charcoal/10 bg-cream-100/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-charcoal">Product images</h3>
          <p className="text-xs text-charcoal-soft">
            The first image is the primary one — it is what appears on cards, in search results and in
            share previews. PNG is best for logos and transparent packshots; JPG, WEBP and AVIF up to
            8 MB also work.
          </p>
        </div>
        {images.length > 0 ? (
          <span className="shrink-0 rounded-full bg-charcoal/5 px-2.5 py-1 text-[11px] font-semibold text-charcoal-soft">
            {images.length} {images.length === 1 ? 'image' : 'images'}
          </span>
        ) : null}
      </div>

      {/* ── Gallery ──────────────────────────────────────────────────────────── */}
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-white',
                index === 0 ? 'border-rose-gold ring-1 ring-rose-gold/30' : 'border-charcoal/10'
              )}
            >
              <div className="relative aspect-square w-full">
                {/* Plain <img>: a stored URL can point at any supplier host, and the admin preview
                    deliberately does not go through next/image's remote allow-list. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-contain p-1.5" />
              </div>

              {index === 0 ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-gold px-2 py-0.5 text-[10px] font-semibold text-white shadow-soft">
                  Primary
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => makePrimary(index)}
                  disabled={blocked}
                  className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-charcoal opacity-0 shadow-soft transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed"
                  title="Make this the primary image"
                >
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Make primary
                </button>
              )}

              <div className="flex items-center justify-between gap-1 border-t border-charcoal/10 bg-white/80 px-1.5 py-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={blocked || index === 0}
                    aria-label="Move image earlier"
                    className="rounded p-1 text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={blocked || index === images.length - 1}
                    aria-label="Move image later"
                    className="rounded p-1 text-charcoal-soft transition-colors hover:bg-charcoal/5 hover:text-charcoal disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={blocked}
                  aria-label={`Remove image ${index + 1}`}
                  className="rounded p-1 text-danger transition-colors hover:bg-danger/10 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── Drop zone ────────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Add product images"
        aria-disabled={disabled}
        onClick={() => {
          if (!blocked) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!blocked) inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files ?? []);
          if (!blocked && files.length) void accept(files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-6 text-center transition-colors',
          dragging && 'border-rose-gold bg-blush-50',
          blocked && 'cursor-not-allowed opacity-60'
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-rose-gold" aria-hidden="true" />
        ) : (
          <ImagePlus className="h-5 w-5 text-rose-gold" aria-hidden="true" />
        )}
        <p className="text-xs font-medium text-charcoal">
          {busy
            ? `Uploading ${progress.done} of ${progress.total}…`
            : images.length > 0
              ? 'Drag & drop more photos here'
              : 'Drag & drop product photos here'}
        </p>
        <p className="text-[11px] text-charcoal-soft">
          or click to choose several at once · PNG, JPG, WEBP, AVIF · max 8 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={blocked}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared so re-picking the same files fires `change` again.
            event.target.value = '';
            if (files.length) void accept(files);
          }}
        />
      </div>

      {/* ── Add by URL ───────────────────────────────────────────────────────── */}
      <Field
        label="Or add an image URL"
        htmlFor="product-image-url"
        hint="For a supplier photo that is already published elsewhere."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="product-image-url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addUrl();
              }
            }}
            placeholder="https://…"
            autoComplete="off"
            disabled={disabled}
            className="min-w-[200px] flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addUrl} disabled={blocked}>
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      </Field>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <p className="text-[11px] text-charcoal-soft">
          The shop renders these on a white background with the salon mark applied automatically.
          Hovering a card in the shop shows the second image.
        </p>
      ) : null}
    </section>
  );
}
