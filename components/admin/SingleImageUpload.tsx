'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * One image, uploaded rather than typed.
 *
 * Built for the category form, where the field was a bare URL input: the column existed and the
 * page could link a picture, but the owner had nowhere to put a file, so in practice every category
 * went without an image.
 *
 * Generic on purpose — the caller passes the upload function, so this does not need to know which
 * bucket or prefix an asset belongs to. `components/admin/ProductImagesUpload` is the multi-image
 * counterpart for products, where order and a chosen primary image matter; here there is only one
 * slot, so there is nothing to order.
 *
 * The preview is the uploaded file as-is. Category images are shown on the shop as flat tiles, not
 * through the product-image pipeline, so what is chosen here is what customers see.
 */

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
const ACCEPT = ALLOWED_TYPES.join(',');
const MAX_BYTES = 8 * 1024 * 1024;

export function SingleImageUpload({
  value,
  onChange,
  upload,
  label,
  hint,
  id = 'single-image',
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  /** Uploads the file and resolves to its public URL. */
  upload: (file: File) => Promise<string>;
  label: string;
  hint?: string;
  id?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = value.trim();
  const blocked = disabled || busy;

  async function accept(file: File) {
    if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      setError(`"${file.name}" is ${file.type || 'not a recognised image'}. Use a PNG, JPG, WEBP or AVIF.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      onChange(await upload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={`${id}-url`} hint={hint}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-white">
            {current ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={current} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-charcoal-soft">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                <Loader2 className="h-4 w-4 animate-spin text-rose-gold" aria-hidden="true" />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`Upload ${label}`}
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
                const file = event.dataTransfer.files?.[0];
                if (!blocked && file) void accept(file);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-4 text-center transition-colors',
                dragging && 'border-rose-gold bg-blush-50',
                blocked && 'cursor-not-allowed opacity-60'
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-rose-gold" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-4 w-4 text-rose-gold" aria-hidden="true" />
              )}
              <p className="text-xs font-medium text-charcoal">
                {current ? 'Drag & drop to replace' : 'Drag & drop an image here'}
              </p>
              <p className="text-[11px] text-charcoal-soft">or click to choose · max 8 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={blocked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so re-picking the same file fires `change` again.
                  event.target.value = '';
                  if (file) void accept(file);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${id}-url`}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="https://…"
                autoComplete="off"
                disabled={disabled}
                className="min-w-[160px] flex-1"
              />
              {current ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange('')}
                  disabled={blocked}
                  className="text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Field>

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
