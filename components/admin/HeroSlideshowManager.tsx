'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { ImageUploadDropzone } from '@/components/admin/ImageUploadDropzone';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  deleteHeroSlide,
  getAllHeroSlides,
  moveHeroSlide,
  setHeroSlideActive,
  upsertHeroSlide,
} from '@/lib/hero-api';
import { cn } from '@/lib/utils';
import type { HeroSlide } from '@/types/database.types';

/** Same bundled placeholder the public hero falls back to, so a missing image is never a broken icon. */
const PLACEHOLDER_IMAGE = '/media/placeholder-salon.svg';

/** Field limits — mirrored by `maxLength` on the inputs and re-checked on submit. */
const ALT_MAX = 180;
const HEADING_MAX = 120;
const SUBHEADING_MAX = 200;

interface SlideDraft {
  image_url: string;
  alt_text: string;
  heading: string;
  subheading: string;
}

const EMPTY_DRAFT: SlideDraft = { image_url: '', alt_text: '', heading: '', subheading: '' };

/**
 * Admin manager for the landing-page hero slideshow (`hero_slides`, migration 0014).
 *
 * Sits inside the Settings page beside the single "Landing page hero" image. Writes go through the
 * shared hero API (`lib/hero-api.ts`) — never directly to Supabase — so the demo mode and the
 * reordering normalisation keep working exactly as the public side expects.
 */
export function HeroSlideshowManager() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<SlideDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  /** The slide currently mid-action (reorder / toggle / delete) — used to disable its row's buttons. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Inline delete confirmation — deliberately not `window.confirm`, which is blocked on some phones. */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getAllHeroSlides();
      setSlides(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the slideshow.');
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

  function updateDraft<K extends keyof SlideDraft>(key: K, value: SlideDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFormError(null);
  }

  function beginEdit(slide: HeroSlide) {
    setEditingId(slide.id);
    setFormError(null);
    setNotice(null);
    setDraft({
      image_url: slide.image_url,
      alt_text: slide.alt_text ?? '',
      heading: slide.heading ?? '',
      subheading: slide.subheading ?? '',
    });
    // The list can be long on a phone — bring the form back into view.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const imageUrl = draft.image_url.trim();
    const alt = draft.alt_text.trim();
    const heading = draft.heading.trim();
    const subheading = draft.subheading.trim();

    if (!imageUrl) {
      setFormError('Choose an image first.');
      return;
    }
    if (alt.length > ALT_MAX) {
      setFormError(`Keep the alt text to ${ALT_MAX} characters or fewer.`);
      return;
    }
    if (heading.length > HEADING_MAX) {
      setFormError(`Keep the heading to ${HEADING_MAX} characters or fewer.`);
      return;
    }
    if (subheading.length > SUBHEADING_MAX) {
      setFormError(`Keep the subheading to ${SUBHEADING_MAX} characters or fewer.`);
      return;
    }
    setFormError(null);

    // Preserve the current visibility when editing: `upsertHeroSlide` defaults `is_active` to true,
    // so without this an edit would silently re-activate a slide the owner had switched off.
    const current = editingId ? slides.find((slide) => slide.id === editingId) : undefined;

    setSaving(true);
    try {
      const result = await upsertHeroSlide({
        id: editingId ?? undefined,
        image_url: imageUrl,
        alt_text: alt || null,
        heading: heading || null,
        subheading: subheading || null,
        is_active: current?.is_active ?? true,
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Could not save the slide. Please try again.');
        return;
      }
      setNotice(editingId ? 'Slide updated.' : 'Slide added — it now rotates on the home page.');
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the slide. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(slide: HeroSlide, direction: 'up' | 'down') {
    if (busyId) return;
    setBusyId(slide.id);
    setError(null);
    setNotice(null);
    try {
      const ok = await moveHeroSlide(slide.id, direction);
      if (!ok) {
        setError('Could not reorder the slides. Please try again.');
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder the slides.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(slide: HeroSlide) {
    if (busyId) return;
    setBusyId(slide.id);
    setError(null);
    setNotice(null);
    try {
      const ok = await setHeroSlideActive(slide.id, !slide.is_active);
      if (!ok) {
        setError('Could not change the slide visibility. Please try again.');
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the slide visibility.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(slide: HeroSlide) {
    if (busyId) return;
    setBusyId(slide.id);
    setError(null);
    setNotice(null);
    try {
      const ok = await deleteHeroSlide(slide.id);
      if (!ok) {
        setError('Could not delete the slide. Please try again.');
      } else {
        setConfirmingDeleteId(null);
        if (editingId === slide.id) resetForm();
        setNotice('Slide deleted.');
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the slide.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hero slideshow</CardTitle>
        <CardDescription>
          The photos that rotate at the top of the home page, in the order you set here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* How the slideshow behaves — plain language, right by the heading. */}
        <ul className="space-y-1.5 rounded-xl bg-cream-100 px-4 py-3 text-sm text-charcoal-soft">
          <li>• The photos change automatically every 5 seconds on the home page.</li>
          <li>• Visitors who ask for reduced motion see only the first photo.</li>
          <li>• With a single slide, no arrows or dots are shown.</li>
          <li>• With no slides at all, the single hero image above is used instead.</li>
        </ul>

        {error ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
            {notice}
          </p>
        ) : null}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-charcoal/10 bg-cream-100/40 p-3 sm:p-4"
        >
          <p className="text-sm font-medium text-charcoal">{editingId ? 'Edit slide' : 'Add a slide'}</p>

          {formError ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium text-charcoal">Slide image</p>
            {draft.image_url ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-charcoal/10 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.image_url}
                  alt=""
                  className="h-16 w-24 rounded-lg object-cover ring-1 ring-charcoal/10"
                />
                <span className="min-w-0 flex-1 text-xs text-charcoal-soft">
                  This photo joins the home-page rotation.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => updateDraft('image_url', '')}
                  className="h-10 shrink-0 px-2 text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ) : (
              <p className="text-xs text-charcoal-soft">No image chosen yet.</p>
            )}
            {/* The dropzone uploads through the shared `gallery` bucket — the same pipeline
                `uploadHeroImage` in lib/hero-api wraps — and hands back the public URL. */}
            <ImageUploadDropzone category="packages" onUploaded={(url) => updateDraft('image_url', url)} />
            <p className="text-xs text-charcoal-soft">
              If a photo fails to upload, check it is a JPG, PNG or WEBP under 8 MB and try again — the
              reason is listed above the drop area.
            </p>
          </div>

          <Field label="Alt text" htmlFor="hero-slide-alt" hint="Describe the photo for screen readers.">
            <Input
              id="hero-slide-alt"
              value={draft.alt_text}
              onChange={(event) => updateDraft('alt_text', event.target.value)}
              maxLength={ALT_MAX}
              placeholder="Bridal makeup by our team at Attariya Chowk"
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Heading (optional)"
              htmlFor="hero-slide-heading"
              hint={`Up to ${HEADING_MAX} characters — an override for the hero heading on this slide.`}
            >
              <Input
                id="hero-slide-heading"
                value={draft.heading}
                onChange={(event) => updateDraft('heading', event.target.value)}
                maxLength={HEADING_MAX}
                placeholder="Bridal season bookings open"
                autoComplete="off"
              />
            </Field>

            <Field
              label="Subheading (optional)"
              htmlFor="hero-slide-subheading"
              hint={`Up to ${SUBHEADING_MAX} characters — an override for the hero subheading on this slide.`}
            >
              <Textarea
                id="hero-slide-subheading"
                rows={2}
                value={draft.subheading}
                onChange={(event) => updateDraft('subheading', event.target.value)}
                maxLength={SUBHEADING_MAX}
                placeholder="Book your slot before Dashain."
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingId ? (
              <Button type="button" variant="outline" onClick={resetForm} className="w-full sm:w-auto">
                Cancel
              </Button>
            ) : null}
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editingId ? 'Save changes' : 'Add slide'}
            </Button>
          </div>
        </form>

        <div>
          <p className="mb-2 text-sm font-medium text-charcoal">Slides</p>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse-soft rounded-2xl bg-charcoal/5" />
              ))}
            </div>
          ) : slides.length === 0 ? (
            <p className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-6 text-center text-sm text-charcoal-soft">
              No slides yet — the single hero image above will be used.
            </p>
          ) : (
            <ol className="space-y-3">
              {slides.map((slide, index) => {
                const isBusy = busyId === slide.id;
                const isFirst = index === 0;
                const isLast = index === slides.length - 1;
                const confirming = confirmingDeleteId === slide.id;
                const label = slide.alt_text?.trim() || `Slide ${index + 1}`;

                return (
                  <li key={slide.id} className="rounded-2xl border border-charcoal/10 bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-charcoal/10 bg-cream-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slide.image_url || PLACEHOLDER_IMAGE}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-charcoal">{label}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-charcoal-soft">Order {slide.display_order + 1}</span>
                          <StatusBadge
                            className={cn(
                              slide.is_active
                                ? 'bg-success/10 text-success ring-success/20'
                                : 'bg-charcoal/5 text-charcoal-soft ring-charcoal/10'
                            )}
                          >
                            {slide.is_active ? 'Active' : 'Inactive'}
                          </StatusBadge>
                        </div>
                        {slide.heading?.trim() || slide.subheading?.trim() ? (
                          <p className="mt-1 truncate text-xs text-charcoal-soft">
                            {[slide.heading?.trim(), slide.subheading?.trim()].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-charcoal/10 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 w-10 px-0"
                        disabled={isFirst || isBusy}
                        onClick={() => void handleMove(slide, 'up')}
                        aria-label={`Move ${label} up`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 w-10 px-0"
                        disabled={isLast || isBusy}
                        onClick={() => void handleMove(slide, 'down')}
                        aria-label={`Move ${label} down`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10"
                        disabled={isBusy}
                        onClick={() => void handleToggleActive(slide)}
                        aria-label={slide.is_active ? `Deactivate ${label}` : `Activate ${label}`}
                      >
                        {slide.is_active ? (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {slide.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10"
                        disabled={isBusy}
                        onClick={() => beginEdit(slide)}
                        aria-label={`Edit ${label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </Button>

                      {confirming ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-danger">Delete this slide?</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-10"
                            loading={isBusy}
                            onClick={() => void handleDelete(slide)}
                          >
                            Delete
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-10"
                            disabled={isBusy}
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-10 text-danger hover:bg-danger/10"
                          disabled={isBusy}
                          onClick={() => {
                            setNotice(null);
                            setConfirmingDeleteId(slide.id);
                          }}
                          aria-label={`Delete ${label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
