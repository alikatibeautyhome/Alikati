'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  GraduationCap,
  Home,
  Images,
  Menu,
  Phone,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { AccountMenu } from '@/components/account/AccountMenu';
import { useCart } from '@/components/shop/CartProvider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import { captureReferralFromUrl } from '@/lib/marketing-api';
import { cn, formatPhoneDisplay } from '@/lib/utils';
import type { SalonSettings } from '@/types/database.types';

/**
 * Public navigation with a "notch" silhouette.
 *
 * Adapted from the VengeanceUI `notch-navbar` registry item. The geometry is kept as designed —
 * a 40px band across the top with a 64px tab bulging downward through the middle, built from three
 * clip-path slices so the curves stay crisp at any width — but three things were changed to fit
 * this project:
 *
 *  1. Colour comes from the brand tokens in tailwind.config.ts (`cream`/`charcoal`/`rose-gold`),
 *     not shadcn's `foreground`/`background`. Those tokens do not exist here, so the upstream
 *     classes would have compiled to nothing and rendered a colourless bar.
 *  2. The theme switch is this project's own `ThemeToggle` on the `abh-theme` store, not
 *     `next-themes`. Installing next-themes would have stood up a second, competing provider.
 *  3. Positioning is `sticky`, not `fixed` — the public layout stacks an announcement banner above
 *     this header and relies on it occupying flow space.
 *
 * Cart, account, phone and affiliate-referral capture are carried over from the previous header;
 * dropping them would have removed the only route to the cart from every storefront page.
 */

const NAV_LEFT = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/services', label: 'Services', icon: Sparkles },
  { href: '/shop', label: 'Shop', icon: ShoppingBag },
] as const;

const NAV_RIGHT = [
  { href: '/academy', label: 'Academy', icon: GraduationCap },
  { href: '/portfolio', label: 'Portfolio', icon: Images },
  { href: '/contact', label: 'Contact', icon: Phone },
] as const;

const NAV_ALL = [...NAV_LEFT, ...NAV_RIGHT];

/** One surface token for every slice, so the notch reads as a single shape over the page background. */
const NOTCH_SURFACE = 'bg-cream-100';

/** A navigation link inside the notch. Icons are decorative — the label carries the meaning. */
function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors',
        active ? 'text-rose-gold' : 'text-charcoal-soft hover:text-charcoal'
      )}
    >
      <Icon className="h-4 w-4 opacity-70 group-hover:opacity-100" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export function NotchHeader({ settings }: { settings: SalonSettings }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { totals, hydrated } = useCart();

  const telHref = `tel:${settings.phone.replace(/[^+\d]/g, '')}`;
  const phoneLabel = formatPhoneDisplay(settings.phone);
  const cartCount = hydrated ? totals.itemCount : 0;

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Remember `?ref=CODE` for the whole visit, so an affiliate referral survives page changes.
  // The header renders on every public page, so this runs once per visit.
  useEffect(() => {
    captureReferralFromUrl(window.location.search);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16',
        // drop-shadow follows the clip-path outline, so the notch casts a real shadow instead of
        // a rectangle. (box-shadow would be clipped away by the slices.)
        '[filter:drop-shadow(0_2px_10px_rgba(46,42,43,0.07))] dark:[filter:drop-shadow(0_1px_8px_rgba(0,0,0,0.45))]'
      )}
    >
      {/* ── Left band ─────────────────────────────────────────────────────────────── */}
      <div className={cn('relative z-20 h-10 min-w-0 flex-1', NOTCH_SURFACE)}>
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1="0"
            y1="39.5"
            x2="100%"
            y2="39.5"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
            className="text-charcoal"
          />
          <line
            x1="0"
            y1="36.5"
            x2="100%"
            y2="36.5"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
            className="text-charcoal"
          />
        </svg>
      </div>

      {/* ── Notch: three slices ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex h-16 shrink-0">
        {/* Left corner — curves from the 40px band down into the 64px tab. */}
        <div className="relative h-full w-[50px] shrink-0">
          <div
            className={cn('absolute inset-0', NOTCH_SURFACE)}
            style={{ clipPath: "path('M0 0 H50 V64 C25 64 25 40 0 40 Z')" }}
          />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 50 64"
            aria-hidden="true"
          >
            <path
              d="M0 39.5 C25 39.5 25 63.5 50 63.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
              className="text-charcoal"
            />
            <path
              d="M0 36.5 C25 36.5 25 60.5 50 60.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
              className="text-charcoal"
            />
          </svg>
        </div>

        {/* Centre — the content area. */}
        <div className="relative -ml-px h-full min-w-0 flex-1">
          <div className={cn('absolute inset-0', NOTCH_SURFACE)}>
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="63.5"
                x2="100%"
                y2="63.5"
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={0.5}
                className="text-charcoal"
              />
              <line
                x1="0"
                y1="60.5"
                x2="100%"
                y2="60.5"
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={0.5}
                className="text-charcoal"
              />
            </svg>
          </div>

          <div className="container relative flex h-full items-end justify-between gap-2 pb-2">
            {/* Desktop: left links */}
            <nav aria-label="Primary" className="mb-1 hidden shrink-0 items-center gap-5 lg:flex xl:gap-7">
              {NAV_LEFT.map((item) => (
                <NavLink key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </nav>

            {/* Mobile: menu button (left) */}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="notch-mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/*
              Logo lockup. Absolutely centred rather than left in the flex row: the right-hand
              action group is wider than the left nav, so flow order would push it off-centre.
            */}
            <Link
              href="/"
              onClick={() => setOpen(false)}
              aria-label="Alikati Beauty Home — home"
              className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl"
            >
              <span className="logo-badge h-9 w-9">
                <Image
                  src="/media/logo.jpg"
                  alt=""
                  width={36}
                  height={36}
                  priority
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="hidden font-display text-sm leading-none text-charcoal lg:block">
                Alikati <span className="text-rose-gold">Beauty Home</span>
              </span>
            </Link>

            <div className="mb-1 flex shrink-0 items-center gap-3">
              {/* Desktop: right links */}
              <nav aria-label="Secondary" className="hidden shrink-0 items-center gap-5 lg:flex xl:gap-7">
                {NAV_RIGHT.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(item.href)} />
                ))}
              </nav>

              <div className="flex shrink-0 items-center gap-1.5 border-l border-charcoal/10 pl-3 sm:gap-2">
                <a
                  href={telHref}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden xl:inline-flex')}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {phoneLabel}
                </a>

                <ThemeToggle className="hidden sm:flex" />

                <AccountMenu />

                <Link
                  href="/cart"
                  aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
                  className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100"
                >
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  {cartCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-gold px-1 text-[11px] font-semibold text-white">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </Link>

                <Link
                  href="/shop"
                  className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}
                >
                  Shop now
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Right corner — mirror of the left. */}
        <div className="relative -ml-px h-full w-[50px] shrink-0">
          <div
            className={cn('absolute inset-0', NOTCH_SURFACE)}
            style={{ clipPath: "path('M0 0 H50 V40 C25 40 25 64 0 64 Z')" }}
          />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 50 64"
            aria-hidden="true"
          >
            <path
              d="M0 63.5 C25 63.5 25 39.5 50 39.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
              className="text-charcoal"
            />
            <path
              d="M0 60.5 C25 60.5 25 36.5 50 36.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
              className="text-charcoal"
            />
          </svg>
        </div>
      </div>

      {/* ── Right band ────────────────────────────────────────────────────────────── */}
      <div className={cn('relative z-20 -ml-px h-10 min-w-0 flex-1', NOTCH_SURFACE)}>
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1="0"
            y1="39.5"
            x2="100%"
            y2="39.5"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
            className="text-charcoal"
          />
          <line
            x1="0"
            y1="36.5"
            x2="100%"
            y2="36.5"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
            className="text-charcoal"
          />
        </svg>
      </div>

      {/*
        Mobile drawer. Rendered inside the header (not a fixed overlay at a hardcoded offset) so it
        sits directly beneath the notch even when the announcement banner is present.
      */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="notch-mobile-nav"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-charcoal/10 bg-cream-100 lg:hidden"
          >
            <nav aria-label="Mobile" className="container flex flex-col py-2">
              {NAV_ALL.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal',
                      isActive(item.href) && 'bg-blush-100 text-charcoal'
                    )}
                  >
                    <Icon className="h-5 w-5 opacity-70" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}

              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
              >
                <ShoppingBag className="h-5 w-5 opacity-70" aria-hidden="true" />
                Cart{cartCount > 0 ? ` (${cartCount})` : ''}
              </Link>

              <AccountMenu layout="stacked" onNavigate={() => setOpen(false)} />

              <ThemeToggle variant="row" className="text-charcoal-soft hover:bg-blush-100 hover:text-charcoal" />

              <div className="mt-2 flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <a href={telHref} className={buttonVariants({ variant: 'outline' })}>
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call {phoneLabel}
                </a>
                <Link href="/shop" onClick={() => setOpen(false)} className={buttonVariants({ size: 'md' })}>
                  Shop products
                </Link>
                <Link
                  href="/services"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ variant: 'secondary', size: 'md' })}
                >
                  Book an appointment
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
