'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Clock, Facebook, Instagram, Mail, MapPin, MessageCircle, Music2, Phone, Truck } from 'lucide-react';
import { createGeneralContactLink } from '@/lib/whatsapp';
import { CATEGORY_LABELS, CATEGORY_ORDER, formatPhoneDisplay, to12Hour } from '@/lib/utils';
import type { SalonSettings } from '@/types/database.types';

/** Public footer: shop links, salon links, contact details and delivery information. */
export function SiteFooter({ settings }: { settings: SalonSettings }) {
  const year = new Date().getFullYear();
  const telHref = `tel:${settings.phone.replace(/[^+\d]/g, '')}`;
  const whatsappHref = createGeneralContactLink({
    business_whatsapp: settings.whatsapp_number,
    context: 'नमस्ते! I would like to know more about your services at Alikati Beauty Home.',
  });

  return (
    <footer className="border-t border-charcoal/10 bg-cream-100">
      {/* Phones get two link columns instead of one: the "Shop" and "Salon" lists sit side by
          side, which cuts roughly a screen off the footer on a 390px device. The brand block and
          the contact details stay full width because their lines are long.
          The extra bottom padding on phones keeps the floating WhatsApp button clear of the last
          row of links. */}
      <div className="container grid grid-cols-2 gap-x-6 gap-y-8 py-12 sm:grid-cols-2 sm:gap-10 sm:pb-12 lg:grid-cols-5">
        <div className="col-span-2 space-y-3 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="logo-badge h-12 w-12">
              <Image
                src="/media/logo.jpg"
                alt="Alikati Beauty Home logo"
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="font-display text-lg text-charcoal">
              Alikati <span className="text-rose-gold">Beauty Home</span>
              <span className="block text-[10px] font-sans font-medium uppercase tracking-[0.16em] text-gold">
                Beauty Parlor &amp; Makeup Studio
              </span>
            </span>
          </div>
          <p className="max-w-sm text-sm text-charcoal-soft">
            Salon, bridal studio, beautician academy and beauty shop serving Attariya Chowk and
            the wider Kailali district.
          </p>
          {settings.delivery_note && (
            <p className="flex items-start gap-2 text-sm text-charcoal-soft">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
              <span>{settings.delivery_note}</span>
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-base text-charcoal">Shop</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/shop" className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold">
                All products
              </Link>
            </li>
            <li>
              <Link
                href="/shop?featured=1"
                className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
              >
                Featured picks
              </Link>
            </li>
            <li>
              <Link href="/cart" className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold">
                Your cart
              </Link>
            </li>
            <li>
              <Link
                href="/track-order"
                className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
              >
                Track your order
              </Link>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-base text-charcoal">Salon</h2>
          <ul className="space-y-2">
            {CATEGORY_ORDER.map((category) => (
              <li key={category}>
                <Link
                  href={`/services?category=${category}`}
                  className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
                >
                  {CATEGORY_LABELS[category]}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/academy" className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold">
                Beauty academy
              </Link>
            </li>
            <li>
              <Link href="/affiliate" className="text-sm text-charcoal-soft transition-colors hover:text-rose-gold">
                Affiliate programme
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-2 space-y-3 sm:col-span-1">
          <h2 className="font-display text-base text-charcoal">Visit &amp; contact</h2>
          <p className="flex items-start gap-2 text-sm text-charcoal-soft">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
            <span className="min-w-0 break-words">{settings.address}</span>
          </p>
          <a
            href={telHref}
            className="flex items-center gap-2 text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
          >
            <Phone className="h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
            {formatPhoneDisplay(settings.phone)}
          </a>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
            Chat on WhatsApp
          </a>
          {settings.email && (
            <a
              href={`mailto:${settings.email}`}
              className="flex min-w-0 items-center gap-2 text-sm text-charcoal-soft transition-colors hover:text-rose-gold"
            >
              <Mail className="h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
              <span className="min-w-0 break-all">{settings.email}</span>
            </a>
          )}

          {(settings.facebook_url || settings.instagram_url || settings.tiktok_url) && (
            <div className="flex items-center gap-2 pt-1">
              {settings.facebook_url && (
                <a
                  href={settings.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Alikati Beauty Home on Facebook"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-charcoal/10 bg-white text-rose-gold transition-colors hover:bg-rose-gold hover:text-white active:bg-rose-gold active:text-white"
                >
                  <Facebook className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {settings.instagram_url && (
                <a
                  href={settings.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Alikati Beauty Home on Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-charcoal/10 bg-white text-rose-gold transition-colors hover:bg-rose-gold hover:text-white active:bg-rose-gold active:text-white"
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
              {settings.tiktok_url && (
                <a
                  href={settings.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Alikati Beauty Home on TikTok"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-charcoal/10 bg-white text-rose-gold transition-colors hover:bg-rose-gold hover:text-white active:bg-rose-gold active:text-white"
                >
                  <Music2 className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
          <p className="flex items-center gap-2 text-sm text-charcoal-soft">
            <Clock className="h-4 w-4 shrink-0 text-rose-gold" aria-hidden="true" />
            Every day, {to12Hour(settings.opening_time)} – {to12Hour(settings.closing_time)}
          </p>
        </div>
      </div>

      {/* On phones this last row sits in the same corner as the floating WhatsApp button, so it
          reserves 96px of clearance below the text. From `sm` up the button no longer overlaps. */}
      <div className="border-t border-charcoal/10">
        <div className="container flex flex-col items-center justify-between gap-2 pb-24 pt-5 text-center text-xs text-charcoal-soft sm:flex-row sm:pb-5 sm:text-left">
          <p>© {year} Alikati Beauty Home. All rights reserved.</p>
          <p>Mahendranagar Road, Attariya Chowk, Kailali, Nepal</p>
        </div>
      </div>
    </footer>
  );
}
