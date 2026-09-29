'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { BeforeAfterSlider } from '@/components/public/BeforeAfterSlider';
import { CATEGORY_LABELS, CATEGORY_ORDER, cn } from '@/lib/utils';
import type { GalleryItem, ServiceCategory } from '@/types/database.types';

type Filter = 'all' | ServiceCategory;

/** Gallery with category filters. Items that carry a before image render a comparison slider. */
export function PortfolioGrid({ items }: { items: GalleryItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const categories = useMemo(() => {
    const present = new Set(items.map((item) => item.category));
    return CATEGORY_ORDER.filter((category) => present.has(category));
  }, [items]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.category === filter)),
    [items, filter]
  );

  if (items.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-display text-lg text-charcoal">Our gallery is being refreshed</p>
        <p className="mt-1 text-sm text-charcoal-soft">
          Please check back soon, or message us on WhatsApp to see recent work.
        </p>
      </div>
    );
  }

  const chips: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...categories.map((category) => ({
      value: category as Filter,
      label: CATEGORY_LABELS[category],
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setFilter(chip.value)}
            aria-pressed={filter === chip.value}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.98]',
              filter === chip.value
                ? 'border-rose-gold bg-rose-gold text-white'
                : 'border-charcoal/15 bg-white text-charcoal-soft hover:border-rose-gold/40 hover:text-charcoal'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-charcoal-soft">
          No photos in this category yet — try another filter.
        </div>
      ) : (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
          {filtered.map((item) => {
            const caption = item.title ?? `${CATEGORY_LABELS[item.category]} result`;

            return (
              <figure key={item.id} className="mb-5 break-inside-avoid">
                {item.before_image_url ? (
                  <BeforeAfterSlider
                    beforeSrc={item.before_image_url}
                    afterSrc={item.image_url}
                    alt={caption}
                  />
                ) : (
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-charcoal/10 shadow-soft">
                    <Image
                      src={item.image_url}
                      alt={caption}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                )}

                <figcaption className="mt-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm text-charcoal">{caption}</span>
                  <Badge className="shrink-0 bg-blush-100 text-charcoal ring-blush-300">
                    {CATEGORY_LABELS[item.category]}
                  </Badge>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
