'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GripVertical } from 'lucide-react';

const SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

/**
 * Before/after comparison slider.
 *
 * The interaction is a full-bleed, visually hidden range input: it gives native touch dragging on
 * Android as well as full keyboard support (arrow keys / Home / End) with an accessible label.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  alt,
}: {
  beforeSrc: string;
  afterSrc: string;
  alt: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-charcoal/10 bg-cream-100 shadow-soft">
      <Image src={afterSrc} alt={`${alt} — after`} fill sizes={SIZES} className="object-cover" />

      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image src={beforeSrc} alt={`${alt} — before`} fill sizes={SIZES} className="object-cover" />
      </div>

      {/* A fixed dark chip, not a themed token: `bg-charcoal` flips to a light colour in dark mode,
          which would leave white label text unreadable on top of the photo. */}
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-charcoal/60 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-black/70">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-rose-gold/90 px-2.5 py-0.5 text-xs font-medium text-white">
        After
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/90"
        style={{ left: `calc(${position}% - 1px)` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-rose-gold shadow-lift"
        style={{ left: `${position}%` }}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={`Drag to compare before and after: ${alt}`}
        aria-valuetext={`${position}% of the before photo showing`}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
