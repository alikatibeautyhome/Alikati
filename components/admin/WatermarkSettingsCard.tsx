'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/label';
import { deleteBrandLogo, getSalonSettings, updateSalonSettings, uploadBrandLogo } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { WATERMARK_DEFAULT_SIZE_PX } from '@/lib/watermark';
import type { SalonSettings } from '@/types/database.types';

/**
 * "Product Watermark & Logo Settings".
 *
 * Writes its own three columns the moment anything changes — it is deliberately **not** part of the
 * page's `SettingsForm`. That form is a single write path that patches every other field on save,
 * and folding the watermark in would mean a logo uploaded now could be reverted by an unrelated
 * Save later in the session. Keeping it separate means the two never interfere.
 *
 * The preview is deliberately rendered at the configured height against both a light and a dark
 * swatch, because the badge sits on white packshots for most products but on coloured backgrounds
 * for the Well 10 shots — the drop shadow is what keeps it legible on both, and that is worth being
 * able to see before publishing.
 */

/** Mirrors the `gallery` bucket, which is where the file lands: images only, 8 MB. */
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_SIZE_PX = 32;
const MAX_SIZE_PX = 64;

/** How long the slider must stay still before the new value is written. */
const SIZE_SETTLE_MS = 500;

export function WatermarkSettingsCard() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [sizePx, setSizePx] = useState(WATERMARK_DEFAULT_SIZE_PX);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Last value known to be stored, so the debounced slider write can tell whether anything changed. */
  const persistedSize = useRef(WATERMARK_DEFAULT_SIZE_PX);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await getSalonSettings();
        if (cancelled) return;
        setLogoUrl(settings.watermark_logo_url);
        setEnabled(settings.watermark_enabled);
        setSizePx(settings.watermark_size_px);
        persistedSize.current = settings.watermark_size_px;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the current settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Every write goes through here so busy state and feedback behave the same way for all four controls. */
  const persist = useCallback(
    async (patch: Partial<SalonSettings>, message: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await updateSalonSettings(patch);
        setNotice(message);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that change.');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const upload = useCallback(
    async (file: File) => {
      // PNG only, as specified: the mark is drawn over photography, so it needs real alpha.
      if (file.type !== 'image/png') {
        setError(`"${file.name}" is ${file.type || 'not a recognised image'}. Upload a PNG — transparency is what keeps the logo from covering the product.`);
        setNotice(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`That PNG is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
        setNotice(null);
        return;
      }

      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const url = await uploadBrandLogo(file);
        // Switched on as part of the same write: uploading a logo and then seeing nothing on the
        // shop is the most likely way to think the feature is broken.
        await updateSalonSettings({ watermark_logo_url: url, watermark_enabled: true });
        const previous = logoUrl;
        setLogoUrl(url);
        setEnabled(true);
        setNotice('Logo uploaded and the badge is on. Refresh the shop to see it.');
        // Tidy up the file this one replaced, so repeated uploads don't pile up in the bucket.
        if (previous) void deleteBrandLogo(previous);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload that file.');
      } finally {
        setBusy(false);
      }
    },
    [logoUrl]
  );

  async function removeLogo() {
    const previous = logoUrl;
    await persist({ watermark_logo_url: null }, 'Logo removed — the badge no longer shows.');
    setLogoUrl(null);
    if (previous) void deleteBrandLogo(previous);
  }

  function toggleEnabled(next: boolean) {
    setEnabled(next);
    void persist({ watermark_enabled: next }, next ? 'Badge switched on.' : 'Badge switched off.');
  }

  // The slider writes once the value settles, rather than on every pixel of the drag.
  useEffect(() => {
    if (loading || sizePx === persistedSize.current) return;
    const timer = setTimeout(() => {
      persistedSize.current = sizePx;
      void persist({ watermark_size_px: sizePx }, `Watermark size set to ${sizePx}px.`);
    }, SIZE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [sizePx, loading, persist]);

  const showBadge = enabled && Boolean(logoUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Watermark &amp; Logo Settings</CardTitle>
        <CardDescription>
          The mark drawn over every product photo on the shop grid, category pages and product pages.
          Upload a PNG with a transparent background; changes save as you make them.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-charcoal-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading the current logo…
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {/* ── Preview ────────────────────────────────────────────────── */}
              <div className="shrink-0 space-y-2">
                <div
                  className={cn(
                    'relative flex h-28 w-40 items-center justify-center overflow-hidden rounded-xl border border-charcoal/10',
                    'bg-gradient-to-r from-white from-50% to-[#3f3f46] to-50%'
                  )}
                >
                  {showBadge && logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logoUrl}
                      alt="Watermark preview"
                      className="pointer-events-none max-w-[45%] select-none object-contain"
                      style={{
                        maxHeight: `${sizePx}px`,
                        filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))',
                      }}
                    />
                  ) : (
                    <span className="px-2 text-center text-[11px] text-charcoal-soft">
                      {logoUrl ? 'Badge switched off' : 'No logo uploaded'}
                    </span>
                  )}
                </div>
                <p className="max-w-40 text-[11px] text-charcoal-soft">
                  Preview — half white, half dark, as it will sit on different product photos.
                </p>
              </div>

              {/* ── Upload / replace / delete ──────────────────────────────── */}
              <div className="min-w-0 flex-1 space-y-3">
                <div
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-label="Upload watermark logo"
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
                    const file = event.dataTransfer.files?.[0];
                    if (!busy && file) void upload(file);
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-charcoal/15 bg-blush-50/60 px-4 py-6 text-center transition-colors',
                    dragging && 'border-rose-gold bg-blush-50',
                    busy && 'cursor-not-allowed opacity-60'
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-rose-gold" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-rose-gold" aria-hidden="true" />
                  )}
                  <p className="text-xs font-medium text-charcoal">
                    {logoUrl ? 'Drag & drop a PNG to replace' : 'Drag & drop your PNG logo here'}
                  </p>
                  <p className="text-[11px] text-charcoal-soft">or click to choose a file · PNG only · max 8 MB</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      // Cleared so re-picking the same file fires `change` again.
                      event.target.value = '';
                      if (file) void upload(file);
                    }}
                  />
                </div>

                {logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeLogo()}
                    disabled={busy}
                    className="text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete current logo
                  </Button>
                ) : null}
              </div>
            </div>

            {/* ── Switch ───────────────────────────────────────────────────── */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-charcoal/10 bg-cream-100/60 p-4">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(event) => toggleEnabled(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--c-rose-gold,#b76e79)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-charcoal">
                  Enable watermark badge on product cards
                </span>
                <span className="block text-xs text-charcoal-soft">
                  When on, the logo is drawn over the bottom-left of every product image on the shop
                  grid, category pages and product pages.
                  {!logoUrl ? ' Upload a logo to see it — nothing is drawn until then.' : ''}
                </span>
              </span>
            </label>

            {/* ── Size ─────────────────────────────────────────────────────── */}
            <Field
              label={`Watermark size — ${sizePx}px`}
              htmlFor="watermark-size"
              hint={`Between ${MIN_SIZE_PX}px and ${MAX_SIZE_PX}px. The height the logo is drawn at.`}
            >
              <input
                id="watermark-size"
                type="range"
                min={MIN_SIZE_PX}
                max={MAX_SIZE_PX}
                step={1}
                value={sizePx}
                disabled={busy}
                onChange={(event) => setSizePx(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-charcoal/15 accent-[var(--c-rose-gold,#b76e79)]"
              />
            </Field>

            {error ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {error}
              </p>
            ) : null}

            {notice ? (
              <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-success">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {notice}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
