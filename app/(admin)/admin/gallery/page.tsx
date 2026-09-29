'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Link2, Trash2 } from 'lucide-react';
import { ImageUploadDropzone } from '@/components/admin/ImageUploadDropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import {
  deleteGalleryItem,
  getGalleryItems,
  reorderGallery,
  setGalleryVisibility,
  updateGalleryItem,
  upsertGalleryItem,
} from '@/lib/api-client';
import { CATEGORY_LABELS, CATEGORY_ORDER, cn } from '@/lib/utils';
import type { GalleryItem, ServiceCategory } from '@/types/database.types';

interface GalleryCardProps {
  item: GalleryItem;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onUnpair: () => void;
  onChanged: () => void;
}

function GalleryCard({
  item,
  selected,
  busy,
  onSelect,
  onToggleVisible,
  onMove,
  onDelete,
  onUnpair,
  onChanged,
}: GalleryCardProps) {
  const [title, setTitle] = useState(item.title ?? '');
  const [savingTitle, setSavingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item.title ?? '');
  }, [item.title]);

  async function saveTitle() {
    const next = title.trim();
    if (next === (item.title ?? '')) return;
    setSavingTitle(true);
    setError(null);
    try {
      await updateGalleryItem(item.id, { title: next || null });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the title.');
    } finally {
      setSavingTitle(false);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-soft',
        selected ? 'border-rose-gold ring-2 ring-rose-gold/30' : 'border-charcoal/10'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select ${item.title ?? 'untitled item'} for before/after pairing`}
        className="relative block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_url}
          alt={item.title ?? 'Gallery image'}
          loading="lazy"
          className="h-40 w-full object-cover"
        />
        <span className="absolute left-2 top-2">
          <Badge className="bg-white/90 text-charcoal">{CATEGORY_LABELS[item.category]}</Badge>
        </span>
        {item.before_image_url ? (
          <span className="absolute right-2 top-2">
            <Badge className="bg-rose-gold text-white">Before/after</Badge>
          </span>
        ) : null}
        {!item.is_visible ? (
          <span className="absolute inset-0 flex items-center justify-center bg-charcoal/45 text-xs font-semibold text-white">
            Hidden
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <label className="sr-only" htmlFor={`gallery-title-${item.id}`}>
          Title for {item.title ?? 'gallery item'}
        </label>
        <Input
          id={`gallery-title-${item.id}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void saveTitle()}
          placeholder="Untitled"
          aria-busy={savingTitle}
        />

        {item.before_image_url ? (
          <div className="flex items-center gap-2 rounded-lg bg-cream-100 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.before_image_url}
              alt="Before"
              loading="lazy"
              className="h-9 w-9 rounded-md object-cover"
            />
            <span className="flex-1 text-xs text-charcoal-soft">Before image paired</span>
             <Button
               type="button"
               size="sm"
               variant="ghost"
               onClick={onUnpair}
               disabled={busy}
               aria-label="Remove before image pairing"
               className="h-10 shrink-0 sm:h-8"
             >
               Un-pair
             </Button>
          </div>
        ) : null}

         <div className="mt-auto flex flex-wrap items-center gap-1.5">
           <Button
             type="button"
             size="sm"
             variant="outline"
             onClick={onToggleVisible}
             disabled={busy}
             aria-label={`${item.is_visible ? 'Hide' : 'Show'} ${item.title ?? 'item'}`}
             className="h-10 min-w-10 sm:h-8 sm:min-w-0"
           >
             {item.is_visible ? (
               <Eye className="h-3.5 w-3.5" aria-hidden="true" />
             ) : (
               <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
             )}
             <span className="hidden sm:inline">{item.is_visible ? 'Visible' : 'Hidden'}</span>
           </Button>
           <Button
             type="button"
             size="sm"
             variant="ghost"
             onClick={() => onMove(-1)}
             disabled={busy}
             aria-label="Move earlier"
             className="h-10 w-10 px-0 sm:h-8 sm:w-8"
           >
             <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
           </Button>
           <Button
             type="button"
             size="sm"
             variant="ghost"
             onClick={() => onMove(1)}
             disabled={busy}
             aria-label="Move later"
             className="h-10 w-10 px-0 sm:h-8 sm:w-8"
           >
             <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
           </Button>
           <Button
             type="button"
             size="sm"
             variant="ghost"
             onClick={onDelete}
             disabled={busy}
             aria-label={`Delete ${item.title ?? 'item'}`}
             className="ml-auto h-10 w-10 px-0 text-danger hover:bg-danger/10 sm:h-8 sm:w-8"
           >
             <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
           </Button>
         </div>

        {error ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [category, setCategory] = useState<ServiceCategory>('hair');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<GalleryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const orderRef = useRef(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await getGalleryItems(true);
      setItems(rows);
      orderRef.current = rows.reduce((max, item) => Math.max(max, item.display_order), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the media library.');
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

  const handleUploaded = useCallback(
    async (url: string, file: File) => {
      const nextOrder = orderRef.current + 1;
      orderRef.current = nextOrder;
      const baseName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      try {
        await upsertGalleryItem({
          image_url: url,
          category,
          title: baseName || 'Untitled',
          display_order: nextOrder,
          is_visible: true,
        });
        await load();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Image uploaded, but the gallery item could not be saved.'
        );
      }
    },
    [category, load]
  );

  async function toggleVisible(item: GalleryItem) {
    setBusyId(item.id);
    try {
      await setGalleryVisibility(item.id, !item.is_visible);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change visibility.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(item: GalleryItem, direction: -1 | 1) {
    const ordered = [...items].sort((a, b) => a.display_order - b.display_order);
    const index = ordered.findIndex((row) => row.id === item.id);
    const neighbour = ordered[index + direction];
    if (!neighbour) return;

    const a = item.display_order;
    const b = neighbour.display_order;
    const nextA = a === b ? index + direction + 1 : b;
    const nextB = a === b ? index + 1 : a;

    setBusyId(item.id);
    try {
      await reorderGallery(item.id, nextA);
      await reorderGallery(neighbour.id, nextB);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder the media library.');
    } finally {
      setBusyId(null);
    }
  }

  async function attachBefore(targetId: string, beforeUrl: string) {
    setBusyId(targetId);
    try {
      await updateGalleryItem(targetId, { before_image_url: beforeUrl });
      setPickerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pair the before image.');
    } finally {
      setBusyId(null);
    }
  }

  async function unpair(id: string) {
    setBusyId(id);
    try {
      await updateGalleryItem(id, { before_image_url: null });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the pairing.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteGalleryItem(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this item.');
    } finally {
      setDeleting(false);
    }
  }

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const pickerCandidates = items.filter((item) => item.id !== selectedId);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Media</p>
        <h1 className="mt-1 font-display text-2xl text-charcoal">Portfolio engine</h1>
        <p className="text-sm text-charcoal-soft">
          Upload work, curate what shows on the public site, and pair before/after shots.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Upload images</CardTitle>
            <CardDescription>Each file is uploaded, then saved to the gallery automatically.</CardDescription>
          </div>
          <div className="max-w-xs">
            <label className="mb-1.5 block text-sm font-medium text-charcoal" htmlFor="upload-category">
              Upload category
            </label>
            <Select
              id="upload-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ServiceCategory)}
            >
              {CATEGORY_ORDER.map((option) => (
                <option key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ImageUploadDropzone category={category} onUploaded={handleUploaded} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Library</CardTitle>
            <CardDescription>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </CardDescription>
          </div>

          {selected ? (
             <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blush-100 px-3 py-2">
               <span className="min-w-0 flex-1 break-words text-sm text-charcoal">
                 Selected: <span className="font-medium">{selected.title ?? 'Untitled'}</span>
               </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPickerOpen(true)}
                disabled={pickerCandidates.length === 0}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Attach before image
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                Clear selection
              </Button>
            </div>
          ) : (
            <p className="text-xs text-charcoal-soft">
              Select an image below to attach a before image.
            </p>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse-soft rounded-2xl bg-charcoal/5" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal/15 bg-cream-100/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-charcoal">No media yet.</p>
              <p className="mt-1 text-sm text-charcoal-soft">Upload your first images above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  busy={busyId === item.id}
                  onSelect={() => setSelectedId((current) => (current === item.id ? null : item.id))}
                  onToggleVisible={() => void toggleVisible(item)}
                  onMove={(direction) => void move(item, direction)}
                  onDelete={() => {
                    setDeleteTarget(item);
                    setDeleteError(null);
                  }}
                  onUnpair={() => void unpair(item.id)}
                  onChanged={() => void load()}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        size="lg"
        title="Attach a before image"
        description={
          selected
            ? `Choose the “before” shot to pair with “${selected.title ?? 'Untitled'}”.`
            : 'Choose an image to pair.'
        }
      >
        {pickerCandidates.length === 0 ? (
          <p className="text-sm text-charcoal-soft">Upload more images first — there is nothing to pair with.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pickerCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  if (selected) void attachBefore(selected.id, candidate.image_url);
                }}
                className="overflow-hidden rounded-xl border border-charcoal/10 bg-white text-left transition-colors hover:border-rose-gold/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.image_url}
                  alt={candidate.title ?? 'Gallery image'}
                  loading="lazy"
                  className="h-28 w-full object-cover"
                />
                <span className="block truncate px-2 py-1.5 text-xs text-charcoal">
                  {candidate.title ?? 'Untitled'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Delete media"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.title ?? 'Untitled'}” from the gallery?`
            : 'Delete this item from the gallery?'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-charcoal-soft">
            This removes the item from the library and the public site. This cannot be undone.
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
              Keep item
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
