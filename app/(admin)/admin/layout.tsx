'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut, Menu } from 'lucide-react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { LowStockAlert } from '@/components/admin/LowStockAlert';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { getAppointmentsByDate, getCurrentStaff, signOutStaff } from '@/lib/api-client';
import { getMfaStatus } from '@/lib/security/mfa';
import { todayISO } from '@/lib/utils';
import type { StaffProfile } from '@/types/database.types';

/**
 * Client-side auth guard for the whole admin console.
 *
 * The server middleware protects `/admin` only when Supabase is configured; in demo mode there
 * is no session, so this layout calls `getCurrentStaff()` and bounces to the login route. A
 * skeleton is rendered while that resolves so the console never flashes a blank screen.
 *
 * NOTE: the login screen lives at `app/(admin)/login/page.tsx`, i.e. the URL `/login` (route
 * groups are transparent) — deliberately OUTSIDE this layout so the guard cannot loop.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Auth guard — runs once on mount.
  useEffect(() => {
    let active = true;
    getCurrentStaff()
      .then(async (current) => {
        if (!active) return;
        if (!current) {
          router.replace('/login');
          return;
        }

        /*
          Second gate, after the password one.

          If this account has enrolled an authenticator, a password-only session is aal1 and must
          not open the console. Without this check the login screen's challenge step would be
          advisory: anyone could sign in with a password and then browse straight to /admin,
          by which point the code would never be asked for. Supabase owns the aal1/aal2 state, so
          this asks it rather than trusting a client-side flag that could be tampered with.
        */
        const mfa = await getMfaStatus();
        if (mfa.challengeRequired) {
          router.replace('/login?next=' + encodeURIComponent(pathname || '/admin'));
          return;
        }

        setStaff(current);
      })
      .catch(() => {
        if (active) router.replace('/login');
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
    // `pathname` is read for the post-MFA redirect target, so it belongs in the dependency list.
  }, [router, pathname]);

  // Collapse the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Notifications ribbon: today's pending appointments, refreshed every 60 seconds.
  useEffect(() => {
    if (!staff) return;
    let active = true;
    const loadPending = async () => {
      try {
        const rows = await getAppointmentsByDate(todayISO());
        if (active) setPendingCount(rows.filter((row) => row.status === 'pending').length);
      } catch {
        // The ribbon is non-critical — swallow transient errors.
      }
    };
    void loadPending();
    const timer = window.setInterval(() => void loadPending(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [staff, pathname]);

  const handleLogout = useCallback(async () => {
    try {
      await signOutStaff();
    } finally {
      router.replace('/login');
    }
  }, [router]);

  if (checking || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="flex items-center gap-3 text-charcoal-soft" role="status">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-rose-gold border-t-transparent"
            aria-hidden="true"
          />
          <span className="text-sm">Checking your session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-cream">
      <AdminSidebar staff={staff} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* `bg-white/85` is not remapped by the dark bridge, so an explicit dark surface keeps
            the toolbar legible when the console is switched to dark mode. */}
        <header className="sticky top-0 z-30 border-b border-charcoal/10 bg-white/85 backdrop-blur dark:bg-surface/85">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-charcoal transition-colors hover:bg-charcoal/5 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-charcoal">{staff.full_name}</p>
              <p className="text-xs capitalize text-charcoal-soft">{staff.role}</p>
            </div>

            <Link
              href="/admin/appointments"
              aria-label={`${pendingCount} pending appointments today`}
              className="inline-flex items-center gap-2 rounded-full border border-warn/25 bg-warn/10 px-3 py-1.5 text-xs font-semibold text-warn transition-colors hover:bg-warn/15"
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingCount} pending
            </Link>

            {/* Self-fetching and self-polling, so the toolbar passes nothing to it. */}
            <LowStockAlert />

            <ThemeToggle />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLogout()}
              aria-label="Log out"
              className="h-10 w-10 shrink-0 px-0 dark:border-white/15 dark:bg-white/10 sm:h-8 sm:w-auto sm:px-3"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
