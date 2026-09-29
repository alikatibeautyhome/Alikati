'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Package, User, UserCircle } from 'lucide-react';
import { useAuth } from '@/components/account/AuthProvider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function firstName(fullName: string): string {
  const [first] = fullName.trim().split(/\s+/);
  return first || 'Account';
}

/**
 * Header entry point to the customer account area.
 *
 * Signed out → a "Sign in" link. Signed in → the customer's first name with a small menu.
 * While the session resolves it renders a same-size placeholder so the header never jumps.
 */
export function AccountMenu({
  layout = 'compact',
  onNavigate,
}: {
  layout?: 'compact' | 'stacked';
  onNavigate?: () => void;
}) {
  const { customer, loading, signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    onNavigate?.();
    await signOut();
  }

  /* ── session still loading: reserve the same space, show a soft placeholder ── */
  if (loading) {
    return layout === 'stacked' ? (
      <span className="block h-11" aria-hidden="true">
        <span className="block h-11 w-full animate-pulse rounded-xl bg-charcoal/5" />
      </span>
    ) : (
      <span className="flex h-11 w-11 items-center justify-center" aria-hidden="true">
        <span className="h-5 w-5 animate-pulse rounded-full bg-charcoal/10" />
      </span>
    );
  }

  /* ───────────────────────────────────── signed out ───────────────────── */
  if (!customer) {
    if (layout === 'stacked') {
      return (
        <Link
          href="/account/login"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
        >
          <User className="h-5 w-5" aria-hidden="true" />
          Sign in
        </Link>
      );
    }

    return (
      <Link
        href="/account/login"
        aria-label="Sign in to your account"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-11 gap-2 px-3')}
      >
        <User className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  /* ───────────────────────────────────── signed in ────────────────────── */
  const label = firstName(customer.full_name);

  if (layout === 'stacked') {
    return (
      <div className="flex flex-col">
        <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-rose-gold">
          Namaste, {label}
        </p>
        <Link
          href="/account"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
        >
          <UserCircle className="h-5 w-5" aria-hidden="true" />
          My account
        </Link>
        <Link
          href="/account#orders"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 rounded-xl px-3 py-3 text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
        >
          <Package className="h-5 w-5" aria-hidden="true" />
          My orders
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-base font-medium text-charcoal-soft transition-colors hover:bg-blush-100 hover:text-charcoal"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${customer.full_name}`}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'h-11 gap-2 px-3',
          open && 'bg-blush-100 text-charcoal'
        )}
      >
        <UserCircle className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-charcoal/10 bg-white p-1.5 shadow-lift"
        >
          <p className="truncate px-3 py-2 text-xs text-charcoal-soft">{customer.email}</p>

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-blush-100"
          >
            <UserCircle className="h-4 w-4" aria-hidden="true" />
            My account
          </Link>
          <Link
            href="/account#orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-blush-100"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            My orders
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-charcoal transition-colors hover:bg-blush-100"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
