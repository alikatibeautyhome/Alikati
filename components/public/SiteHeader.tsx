'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Phone, ShoppingBag, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useCart } from '@/components/shop/CartProvider';
import { AccountMenu } from '@/components/account/AccountMenu';
import { captureReferralFromUrl } from '@/lib/marketing-api';
import { cn, formatPhoneDisplay } from '@/lib/utils';
import type { SalonSettings } from '@/types/database.types';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/shop', label: 'Shop' },
  { href: '/well10', label: 'Well10' },
  { href: '/academy', label: 'Academy' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/contact', label: 'Contact' },
] as const;

/** Sticky public navigation with a cart badge and an accessible mobile drawer. */
export function SiteHeader({ settings }: { settings: SalonSettings }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { totals, hydrated } = useCart();

  const telHref = `tel:${settings.phone.replace(/[^+\d]/g, '')}`;
  const phoneLabel = formatPhoneDisplay(settings.phone);

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

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const cartCount = hydrated ? totals.itemCount : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-cream/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-2 sm:gap-3">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex min-w-0 items-center gap-2.5 rounded-xl py-1"
          aria-label="Alikati Beauty Home — home"
        >
          <span className="logo-badge h-10 w-10">
            <Image
              src="/media/logo.jpg"
              alt="Alikati Beauty Home logo"
              width={40}
              height={40}
              priority
              className="h-full w-full object-cover"
            />
          </span>
          <span className="min-w-0 font-display text-sm leading-tight text-charcoal sm:text-lg">
            <span className="block truncate">
              Alikati <span className="text-rose-gold">Beauty Home</span>
            </span>
            <span className="hidden text-[10px] font-sans font-medium uppercase tracking-[0.14em] text-gold sm:block">
              Parlour · Studio · Shop
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal',
                isActive(item.href) && 'bg-blush-100 text-charcoal'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <a
            href={telHref}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden xl:inline-flex')}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            {phoneLabel}
          </a>

          <AccountMenu />

          {/* Theme switch for desktop; on phones it lives in the drawer to save header width. */}
          <ThemeToggle className="hidden sm:flex" />

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

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="public-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush-100 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="public-mobile-nav"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-charcoal/10 bg-cream lg:hidden"
        >
          <nav aria-label="Mobile" className="container flex flex-col py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal',
                  isActive(item.href) && 'bg-blush-100 text-charcoal'
                )}
              >
                {item.label}
              </Link>
            ))}

            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
            >
              Cart{cartCount > 0 ? ` (${cartCount})` : ''}
            </Link>

            <AccountMenu layout="stacked" onNavigate={() => setOpen(false)} />

            <ThemeToggle variant="row" className="text-charcoal-soft hover:bg-blush-100 hover:text-charcoal" />

            <div className="mt-2 flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <a href={telHref} className={buttonVariants({ variant: 'outline' })}>
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call {phoneLabel}
              </a>
              <Link
                href="/shop"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: 'md' })}
              >
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
        </div>
      )}
    </header>
  );
}
