'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, XCircle } from 'lucide-react';
import { uploadGalleryImage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ServiceCategory } from '@/types/database.types';

const MAX_BYTES = 8 * 1024 * 1024;

type EntryStatus = 'uploading' | 'done' | 'failed';

interface UploadEntry {
  id: string;
  name: string;
  status: EntryStatus;
  error?: string;
}

export interface ImageUploadDropzoneProps {
  /** Destination bucket folder — also used when persisting the gallery row. */
  category: ServiceCategory;
  /** Called with the public URL once a file uploads successfully. */
  onUploaded: (url: string, file: File) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop (or click-to-select) multi-file image uploader.
 *
 * Guards MIME type and the 8 MB size ceiling before touching the network, and keeps a
 * per-file status list so a failed file can be retried by dropping it again.
 */
export function ImageUploadDropzone({
  category,
  onUploaded,
  disabled = false,
  className,
}: ImageUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);

      for (const file of list) {
        const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (!file.type.startsWith('image/')) {
          setEntries((prev) => [
            ...prev,
            { id, name: file.name, status: 'failed', error: 'Not an image file' },
          ]);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setEntries((prev) => [
            ...prev,
            { id, name: file.name, status: 'failed', error: 'Larger than 8 MB' },
          ]);
          continue;
        }

        setEntries((prev) => [...prev, { id, name: file.name, status: 'uploading' }]);

        try {
          const url = await uploadGalleryImage(file, category);
          setEntries((prev) =>
            prev.map((entry) => (entry.id === id ? { ...entry, status: 'done' } : entry))
          );
          onUploaded(url, file);
        } catch (err) {
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : entry
            )
          );
        }
      }
    },
    [category, onUploaded]
  );

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload images"
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && event.dataTransfer.files.length > 0) {
            void processFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-charcoal/15 bg-white/70 px-4 py-8 text-center transition-colors sm:px-6 sm:py-10',
          dragging && 'border-rose-gold bg-blush-50',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <ImagePlus className="h-7 w-7 text-rose-gold" aria-hidden="true" />
        <p className="text-sm font-medium text-charcoal">Drag &amp; drop images here</p>
        <p className="text-xs text-charcoal-soft">or click to choose files · JPG, PNG, WEBP up to 8 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) void processFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {entries.length > 0 ? (
        <ul className="space-y-1.5" aria-live="polite">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-lg border border-charcoal/10 bg-white px-3 py-2 text-xs"
            >
              {entry.status === 'uploading' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-rose-gold" aria-hidden="true" />
              ) : entry.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              )}
              <span className="flex-1 truncate text-charcoal">{entry.name}</span>
              <span
                className={cn(
                  'shrink-0 font-medium',
                  entry.status === 'failed' ? 'text-danger' : 'text-charcoal-soft'
                )}
              >
                {entry.status === 'uploading'
                  ? 'Uploading…'
                  : entry.status === 'done'
                    ? 'Done'
                    : (entry.error ?? 'Failed')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
