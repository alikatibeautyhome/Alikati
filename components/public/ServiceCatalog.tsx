'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ServiceCard } from '@/components/public/ServiceCard';
import { ServiceRail } from '@/components/public/ServiceRail';
import { BookingModal } from '@/components/public/BookingModal';
import { CATEGORY_LABELS, CATEGORY_ORDER, cn } from '@/lib/utils';
import type { SalonSettings, Service, ServiceCategory } from '@/types/database.types';

type Filter = 'all' | ServiceCategory;

/**
 * Filterable service catalogue. Owns the booking modal state: tapping "Book" on any card opens
 * the multi-step booking engine for that service.
 */
export function ServiceCatalog({
  services,
  settings,
  initialCategory,
  featured = [],
}: {
  services: Service[];
  settings: SalonSettings;
  initialCategory?: ServiceCategory;
  /** Featured services for the "Most booked" rail shown above the filters. */
  featured?: Service[];
}) {
  const [filter, setFilter] = useState<Filter>(initialCategory ?? 'all');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Service | null>(null);

  const chips: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...CATEGORY_ORDER.map((category) => ({
      value: category as Filter,
      label: CATEGORY_LABELS[category],
    })),
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      if (filter !== 'all' && service.category !== filter) return false;
      if (!q) return true;
      return (
        service.title.toLowerCase().includes(q) ||
        (service.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [services, filter, query]);

  if (services.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <p className="font-display text-lg text-charcoal">Our price list is being updated</p>
        <p className="mt-1 text-sm text-charcoal-soft">
          Please call {settings.phone} and we will happily talk you through current services and prices.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {featured.length > 0 ? (
        <ServiceRail
          services={featured}
          onBook={setActive}
          eyebrow="Popular right now"
          heading="Most booked"
          description="The treatments our clients book again and again — swipe to browse, then choose your time below."
        />
      ) : null}

      <div className="no-scrollbar rail-hint -mx-4 flex scroll-pl-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="service-search" className="sr-only">
            Search services
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft"
            aria-hidden="true"
          />
          <Input
            id="service-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or keyword…"
            className="pl-9"
          />
        </div>

        <p className="text-sm text-charcoal-soft" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'service' : 'services'} found
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="font-display text-lg text-charcoal">No services match your search</p>
          <p className="mt-1 text-sm text-charcoal-soft">
            Try another keyword, choose &ldquo;All&rdquo;, or call us and we will help you pick the right
            treatment.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <ServiceCard key={service.id} service={service} onBook={setActive} />
          ))}
        </div>
      )}

      <BookingModal
        open={active !== null}
        service={active}
        settings={settings}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
