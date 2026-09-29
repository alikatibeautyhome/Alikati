'use client';

import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { createGeneralContactLink } from '@/lib/whatsapp';
import type { SalonSettings } from '@/types/database.types';

/**
 * Fixed WhatsApp call-to-action. Hidden inside the staff console (`/admin`).
 *
 * On a phone, the product detail page's sticky purchase bar already occupies this exact
 * bottom-right corner, so the floating button is suppressed there (from `lg` up the sticky bar
 * is gone, so the button returns). That page offers WhatsApp ordering twice over — the
 * "Order on WhatsApp" button in the purchase panel and the footer link.
 */
export function WhatsAppFloatingButton({ settings }: { settings: SalonSettings }) {
  const pathname = usePathname();

  if ((pathname ?? '').startsWith('/admin')) return null;

  // `/shop/<slug>` is a product page; `/shop` itself is not.
  const onProductPage = /^\/shop\/[^/]+/.test(pathname ?? '');

  const href = createGeneralContactLink({
    business_whatsapp: settings.whatsapp_number,
    context: 'नमस्ते! I would like to book an appointment at Alikati Beauty Home.',
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Alikati Beauty Home on WhatsApp"
      className={`fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-rose-gold text-white shadow-lift transition-transform hover:scale-105 hover:bg-rose-600 sm:bottom-6 sm:right-6 ${
        onProductPage ? 'hidden lg:flex' : ''
      }`}
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </a>
  );
}
