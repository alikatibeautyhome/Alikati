'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { uploadProductImage } from '@/lib/shop-admin-api';
import { cn } from '@/lib/utils';

/**
 * The product-image section of the admin product form.
 *
 * Uploads go to the public `products` Storage bucket through `uploadProductImage`, which returns a
 * CDN URL that is written straight into `image_url`. A supplier's published photo can still be
 * pasted as a URL, so the two routes into this field stay available side by side.
 *
 * Type and size are checked **before** the request, mirroring the bucket's own configuration
 * (images only, 8 MB). Catching it here means a rejected file costs no upload and produces a
 * specific message rather than a raw Storage error.
 *
 * The preview shows the file as uploaded. The storefront re-renders it on a white canvas with the
 * salon's mark applied — see `app/api/product-image/route.ts` — so a transparent PNG looks
 * different here than it does on the shop, which the note under the field explains.
 */

/** Mirrors the `products` bucket exactly: no other MIME type is accepted server-side. */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
const ACCEPT = ALLOWED_TYPES.join(',');
const MAX_BYTES = 8 * 1024 * 1024;

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProductImageUpload({
  value,
  onChange,
  disabled = false,
  id = 'product-image',
}: {
  /** Current `image_url`, either an uploaded CDN URL or a pasted remote one. */
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** Base id; the file input and the URL input derive their own ids from it. */
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
        setError('That file type is not supported. Use a PNG, JPG, WEBP or AVIF image.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`That file is ${formatMegabytes(file.size)} — the limit is 8 MB.`);
        return;
      }

      setUploading(true);
      setError(null);
      try {
        onChange(await uploadProductImage(file));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload the image.');
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  const current = value.trim();
  const busy = disabled || uploading;

  return (
    <section className="space-y-3 rounded-2xl border border-charcoal/10 bg-cream-100/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-charcoal">Product image</h3>
          <p className="text-xs text-charcoal-soft">
            PNG is best for logos and transparent packshots. JPG, WEBP and AVIF up to 8 MB also work.
          </p>
        </div>
        {current ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            disabled={busy}
            className="shrink-0 text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-white">
          {current ? (
            /* Plain <img>: the source can be any supplier host, and the admin preview does not go
               through next/image's remote allow-list. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={current}
              alt="Product image preview"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-charcoal-soft">
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
              <span className="text-[11px]">No image yet</span>
            </div>
          )}

          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75">
              <Loader2 className="h-5 w-5 animate-spin text-rose-gold" aria-hidden="true" />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Upload product image"
            aria-disabled={disabled}
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
              const file = event.dataTransfer.files?.[0];
              if (!busy && file) void upload(file);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-6 text-center transition-colors',
              dragging && 'border-rose-gold bg-blush-50',
              busy && 'cursor-not-allowed opacity-60'
            )}
          >
            <ImagePlus className="h-5 w-5 text-rose-gold" aria-hidden="true" />
            <p className="text-xs font-medium text-charcoal">Drag &amp; drop a PNG here</p>
            <p className="text-[11px] text-charcoal-soft">or click to choose a file</p>
            <input
              ref={inputRef}
              id={id}
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so re-selecting the same file fires `change` again.
                event.target.value = '';
                if (file) void upload(file);
              }}
            />
          </div>

          <Field
            label="Or paste an image URL"
            htmlFor={`${id}-url`}
            hint="For a supplier photo that is already published elsewhere."
          >
            <Input
              id={`${id}-url`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="https://…"
              autoComplete="off"
              disabled={disabled}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}

          {current ? (
            <p className="text-[11px] text-charcoal-soft">
              The shop shows this on a white background with the salon mark applied automatically.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
