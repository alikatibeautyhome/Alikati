import Image from 'next/image';
import Link from 'next/link';
import { Clock, MessageCircle, Phone } from 'lucide-react';
import type { SalonSettings } from '@/types/database.types';

/**
 * What the public site shows while maintenance mode is on.
 *
 * This is a full page rather than an overlay: the public layout returns it *instead of* its
 * children, so none of the normal shell renders — no header, no footer, no cart, no analytics
 * beacon, no product schema. That is deliberate. A maintenance window is not a page view, and
 * counting it as one would quietly inflate the traffic dashboard with visits to a screen that sells
 * nothing.
 *
 * The contact routes matter more than the explanation. Somebody who lands here during a bridal
 * booking season has a real appointment to make, and "we're closed" with no way through loses that
 * customer permanently. So the phone and WhatsApp links are given equal weight to the heading, and
 * the wording is written to reassure rather than to announce a fault.
 *
 * A staff link sits at the bottom so the owner can get into the admin console to switch this off.
 * The console is never behind maintenance mode — a switch you cannot reach is not a switch.
 */
export function MaintenanceScreen({ settings }: { settings: SalonSettings }) {
  const message =
    settings.maintenance_message?.trim() ||
    'We are carrying out a short update to the site. Everything is safe — your orders and bookings are unaffected.';

  const eta = settings.maintenance_eta?.trim();
  const whatsapp = settings.whatsapp_number?.replace(/\D/g, '');

  return (
    <main
      id="main-content"
      className="gradient-warm flex min-h-screen items-center justify-center px-4 py-16"
    >
      <div className="w-full max-w-lg text-center">
        <span className="logo-badge mx-auto flex h-16 w-16">
          <Image
            src="/media/logo.jpg"
            alt="Alikati Beauty Home logo"
            width={64}
            height={64}
            priority
            className="h-full w-full rounded-full object-cover"
          />
        </span>

        <p className="mt-6 font-display text-lg text-charcoal">Alikati Beauty Home</p>
        <p className="eyebrow mt-1">Mahendranagar Road, Attariya Chowk, Kailali</p>

        <div className="panel mt-8 px-6 py-8">
          <h1 className="font-display text-2xl text-charcoal sm:text-3xl">
            We&rsquo;ll be back very soon
          </h1>

          {/* whitespace-pre-line so a message typed with line breaks reads as the owner wrote it. */}
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-charcoal-soft">
            {message}
          </p>

          {eta ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-gold/25 bg-rose-gold/8 px-4 py-2 text-sm font-medium text-charcoal">
              <Clock className="h-4 w-4 text-rose-gold" aria-hidden="true" />
              {eta}
            </p>
          ) : null}
        </div>

        <p className="mt-8 text-sm text-charcoal-soft">
          Need to reach us in the meantime? We are still here.
        </p>

        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          {settings.phone ? (
            <a
              href={`tel:${settings.phone.replace(/\s+/g, '')}`}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-rose-gold px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {settings.phone}
            </a>
          ) : null}

          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp}`}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-charcoal/15 bg-white/80 px-6 text-sm font-semibold text-charcoal transition-colors hover:border-rose-gold/50"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp us
            </a>
          ) : null}
        </div>

        {/* The way back in. Deliberately quiet — customers do not need it, staff do. */}
        <p className="mt-12 text-xs text-charcoal-soft/70">
          Staff?{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-charcoal">
            Sign in to the admin console
          </Link>
        </p>
      </div>
    </main>
  );
}
