import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { siteUrl } from '@/lib/supabase/config';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Alikati Beauty Home — Salon, Bridal Studio & Academy in Attariya',
    template: '%s | Alikati Beauty Home',
  },
  description:
    'Salon, bridal studio and beautician academy at Mahendranagar Road, Attariya Chowk, Kailali. Book hair, bridal, nail and skin services in NPR, or join our professional beautician courses.',
  keywords: [
    'beauty parlour Attariya',
    'bridal makeup Kailali',
    'salon Mahendranagar Road',
    'beautician course Nepal',
    'keratin treatment Attariya',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Alikati Beauty Home',
    locale: 'en_NP',
    url: siteUrl(),
    images: [{ url: '/media/og-image.png', width: 1200, height: 630, alt: 'Alikati Beauty Home' }],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Mobile browser chrome follows the active theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FDFBF8' },
    { media: '(prefers-color-scheme: dark)', color: '#181110' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  // Lets the footer reach the edge of a notched phone while content stays inside safe areas.
  viewportFit: 'cover',
};

/**
 * Applied before first paint so a dark-mode visitor never sees a white flash.
 * Keep the key in sync with THEME_STORAGE_KEY in components/theme/ThemeProvider.tsx.
 */
const themeBootstrap = `(function(){try{var k='abh-theme';var s=localStorage.getItem(k);var dark=s==='dark'||((!s||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',dark);r.dataset.theme=dark?'dark':'light';}catch(e){}})();`;

/*
  There is no business schema here any more, on purpose.

  This file used to emit a static `BeautySalon` block as a fallback, with a comment saying the
  settings-driven variant lived in the public layout. Both rendered — the public layout is *inside*
  this one — so every public page carried two conflicting descriptions of the same business: one
  with live opening hours and one frozen at 08:00–19:00; one with a real price range and one with
  'रूरू'. Two LocalBusiness blocks disagreeing about the same @id is worse than one incomplete
  block, because a crawler has to choose.

  The public layout's copy is the one that survives: it reads phone, address and hours from
  salon_settings, so editing them in the console updates the markup, and it carries the @id the
  rest of the site can point at. Nothing is lost by dropping this — the only routes not covered by
  the public layout are /admin and /login, and a beauty salon is not the subject of either.
*/

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script mutates <html> before React hydrates.
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />

        <ThemeProvider>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
