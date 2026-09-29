'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  Images,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Scissors,
  Settings,
  Share2,
  FolderOpen,
  ShieldCheck,
  Star,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { cn } from '@/lib/utils';
import type { StaffProfile } from '@/types/database.types';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Salon operations. */
const SALON_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/admin/services', label: 'Services', icon: Scissors },
  { href: '/admin/leads', label: 'Leads', icon: GraduationCap },
  { href: '/admin/gallery', label: 'Media', icon: Images },
  // Distinct from the entry above: that one curates the public portfolio, while this one is the
  // catalogue of everything uploaded, filed by category.
  { href: '/admin/media', label: 'Media library', icon: FolderOpen },
];

/** Shop operations. */
const SHOP_ITEMS: NavItem[] = [
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/coupons', label: 'Coupons', icon: Ticket },
  { href: '/admin/affiliates', label: 'Affiliates', icon: Share2 },
  // Customer-submitted reviews queue here for approval before they reach the landing page.
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
];

/** Team & access control — who can sign in to the console. */
const TEAM_ITEMS: NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: ShieldCheck },
];

const SETTINGS_ITEM: NavItem = { href: '/admin/settings', label: 'Settings', icon: Settings };

export interface AdminSidebarProps {
  staff: StaffProfile;
  /** Mobile drawer state. The desktop rail is always visible from `lg` up. */
  open?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ staff, open = false, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname.startsWith(`${href}/`);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          active ? 'bg-rose-gold text-white shadow-soft' : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  };

  const content = (
    // `bg-charcoal` flips to a light tone under `.dark` (it is really a text token), so the rail
    // pins its own dark background in dark mode to keep the white labels legible.
    <div className="flex h-full flex-col bg-charcoal text-white dark:bg-[#211512]">
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span className="logo-badge h-11 w-11">
            <Image
              src="/media/logo.jpg"
              alt="Alikati Beauty Home logo"
              width={44}
              height={44}
              className="h-full w-full object-cover"
            />
          </span>
          <div>
            <p className="font-display text-lg leading-tight text-white">Alikati</p>
            <p className="text-xs text-white/55">Beauty Home · Admin</p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Admin sections" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        <div className="space-y-1">{SALON_ITEMS.map(renderNavItem)}</div>

        <div className="space-y-1">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Shop
          </p>
          {SHOP_ITEMS.map(renderNavItem)}
        </div>

        {/* Account management is administrator-only — the API enforces it too, this just keeps a
            staff member from landing on a screen that would 403. */}
        {staff.role === 'admin' ? (
          <div className="space-y-1 border-t border-white/10 pt-3">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
              Team
            </p>
            {TEAM_ITEMS.map(renderNavItem)}
          </div>
        ) : null}

        <div className="space-y-1 border-t border-white/10 pt-3">{renderNavItem(SETTINGS_ITEM)}</div>
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 px-3 py-2">
          <p className="truncate text-sm font-medium text-white">{staff.full_name}</p>
          <p className="text-xs capitalize text-white/55">{staff.role}</p>
        </div>
        <ThemeToggle variant="row" className="text-white/70" />
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          View public site
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-lift animate-slide-up"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            {content}
          </div>
        </div>
      ) : null}
    </>
  );
}
