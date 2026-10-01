'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { productImageSrc } from '@/lib/product-image';
import {
  CATEGORY_LABELS,
  discountPercent,
  effectivePrice,
  formatDuration,
  formatNPR,
} from '@/lib/utils';
import type { Service, ServiceCategory } from '@/types/database.types';

/** Category placeholder used when a service has no uploaded image. */
function placeholderFor(category: ServiceCategory): string {
  return category === 'packages'
    ? '/media/placeholder-package.svg'
    : `/media/placeholder-${category}.svg`;
}

/**
 * Service tile used on the landing page and in the catalogue.
 * When `onBook` is supplied the "Book" action opens the booking modal; otherwise it links to
 * the full catalogue (this keeps the card usable inside a server-rendered grid).
 */
export function ServiceCard({
  service,
  onBook,
}: {
  service: Service;
  onBook?: (service: Service) => void;
}) {
  const discount = discountPercent(service);
  const price = effectivePrice(service);
  /*
    Routed through the same `/api/product-image` pipeline the shop uses, rather than handed to
    next/image raw. A raw remote URL is only served if its host appears in `remotePatterns`, which
    lists two supplier domains — so any other host an owner pastes in (and the salon's own photos
    live on Supabase, not on those two) resolved to a 400 and an empty card. The pipeline fetches
    server-side, so the host stops mattering, and a missing or unusable URL still lands on the
    category placeholder instead of a broken frame.
  */
  const imageSrc = productImageSrc(service.image_url, placeholderFor(service.category));

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-blush-50">
        <Image
          src={imageSrc}
          alt={service.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
        {discount !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-sale px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft sm:left-3 sm:top-3 sm:px-2.5 sm:text-xs">
            {discount}% off
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Badge className="bg-blush-100 text-charcoal ring-blush-300">
            {CATEGORY_LABELS[service.category]}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-charcoal-soft">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDuration(service.duration_minutes)}
          </span>
        </div>

        <h3 className="line-clamp-2 break-words font-display text-lg text-charcoal">
          {service.title}
        </h3>

        {service.description && (
          <p className="line-clamp-2 break-words text-sm text-charcoal-soft">
            {service.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          <div className="min-w-0">
            {discount !== null ? (
              <p className="flex items-baseline gap-2">
                <span className="text-xs text-charcoal-soft line-through">
                  {formatNPR(service.price_npr)}
                </span>
                <span className="font-display text-xl text-price">{formatNPR(price)}</span>
              </p>
            ) : (
              <p className="font-display text-xl text-price">{formatNPR(price)}</p>
            )}
          </div>

          {onBook ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onBook(service)}
              className="min-h-11 shrink-0 px-5"
            >
              Book
            </Button>
          ) : (
            <Link
              href="/services"
              className={buttonVariants({ size: 'sm', className: 'min-h-11 shrink-0 px-5' })}
            >
              Book
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
