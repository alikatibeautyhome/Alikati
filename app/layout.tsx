import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { FALLBACK_CONTACT, siteUrl } from '@/lib/supabase/config';
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

/** Static business schema — the settings-driven variant is emitted by the public layout. */
const businessSchema = {
  '@context': 'https://schema.org',
  '@type': 'BeautySalon',
  name: 'Alikati Beauty Home',
  description:
    'Salon, bridal studio and beautician academy serving Attariya Chowk and the wider Kailali district.',
  url: siteUrl(),
  telephone: FALLBACK_CONTACT.phone,
  priceRange: 'रूरू',
  currenciesAccepted: 'NPR',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Mahendranagar Road, Attariya Chowk',
    addressLocality: 'Kailali',
    addressRegion: 'Sudurpashchim',
    addressCountry: 'NP',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
      opens: '08:00',
      closes: '19:00',
    },
  ],
};

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
        />
      </body>
    </html>
  );
}
